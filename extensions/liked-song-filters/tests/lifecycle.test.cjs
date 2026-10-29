const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const { createStore } = require("../src/storage.js");
const { createTagCatalog } = require("../src/tags.js");
const { createExtension } = require("../src/lifecycle.js");

function fixture() {
  const tasks = new Map(), disk = new Map();
  let serial = 0, listener, observer, mounts = 0, destroys = 0, disconnected = false, clock = 0;
  const notifications = [], warnings = [];
  let page = {};
  const platform = { History: { location: { pathname: "/search" }, listen(fn) { listener = fn; return () => { listener = null; }; } },
    LibraryAPI: { _likedSongsUri: "spotify:user:test:collection", getTracksFilterTags: async () => [{ name: "Chill", filter: "tags contains chill" }] },
    PlaylistAPI: { getContents() {} } };
  const host = { Date: { now: () => clock }, console: { warn: (...args) => warnings.push(args) }, document: { body: {}, querySelector: () => page },
    localStorage: { getItem: (key) => disk.get(key), setItem: (key, value) => disk.set(key, value) },
    Spicetify: { Platform: platform, CosmosAsync: { get() {} }, showNotification: (message) => notifications.push(message) },
    setTimeout(fn) { tasks.set(++serial, fn); return serial; }, clearTimeout(id) { tasks.delete(id); },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { disconnected = true; } } };
  const deps = { core, createStore, createTagCatalog, version: "test", mountPanel({ state, persist }) {
    mounts++;
    return { page, panel: { isConnected: true }, toggle: { isConnected: true }, state, persist, destroy() { destroys++; } };
  } };
  async function flush() {
    const pending = [...tasks.values()]; tasks.clear();
    pending.forEach((fn) => fn());
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { host, deps, platform, tasks, notifications, warnings, flush, advance(ms) { clock += ms; }, navigate(path) { platform.History.location.pathname = path; listener?.(); },
    mutate() { observer?.(); }, replacePage() { page = {}; observer?.(); },
    counts: () => ({ mounts, destroys, disconnected }) };
}

test("starts outside Liked Songs, remounts on navigation and DOM replacement, avoids duplicates", async () => {
  const f = fixture(), extension = createExtension(f.host, f.deps);
  await f.flush(); assert.equal(f.counts().mounts, 0);
  f.navigate("/collection/tracks"); await f.flush(); assert.equal(f.counts().mounts, 1);
  f.mutate(); await f.flush(); assert.equal(f.counts().mounts, 1);
  extension.state.draft.include.push("Chill"); extension.mounted.persist();
  f.navigate("/search"); await f.flush(); assert.equal(extension.mounted, null);
  f.navigate("/collection/tracks"); await f.flush();
  assert.deepEqual(extension.mounted.state.draft.include, ["Chill"]);
  f.replacePage(); await f.flush(); assert.equal(f.counts().mounts, 3);
  assert.equal(f.counts().destroys, 2);
  extension.destroy();
  assert.equal(f.counts().disconnected, true);
  assert.equal(f.host.LikedSongFilters, undefined);
});

test("reloading the extension cleans old listeners and restores persisted rules", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  const first = createExtension(f.host, f.deps);
  await f.flush();
  first.state.draft.exclude.push("Sad"); first.mounted.persist();
  const second = createExtension(f.host, f.deps);
  await f.flush();
  assert.equal(f.counts().destroys, 1);
  assert.deepEqual(second.state.draft.exclude, ["Sad"]);
  assert.equal(f.host.LikedSongFilters, second);
  second.destroy();
});

test("slow tag discovery cannot mount after navigation away or extension shutdown", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let resolve;
  f.platform.LibraryAPI.getTracksFilterTags = () => new Promise((done) => { resolve = done; });
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  f.navigate("/search");
  extension.destroy();
  resolve([{ name: "Chill", filter: "tags contains chill" }]);
  await f.flush();
  assert.equal(f.counts().mounts, 0);
});

test("waits for Spicetify before initialization", async () => {
  const f = fixture(), api = f.host.Spicetify;
  delete f.host.Spicetify;
  const extension = createExtension(f.host, f.deps);
  await f.flush(); assert.equal(f.tasks.size, 1);
  f.host.Spicetify = api;
  f.platform.History.location.pathname = "/collection/tracks";
  await f.flush(); assert.equal(f.counts().mounts, 1);
  extension.destroy();
});

test("accounts using the same collection URI keep separate local rules", async () => {
  const f = fixture();
  f.platform.UserAPI = { getUser: async () => ({ username: "first-account" }) };
  f.platform.History.location.pathname = "/collection/tracks";
  const first = createExtension(f.host, f.deps);
  await f.flush();
  first.state.draft.include.push("Chill"); first.mounted.persist();
  f.platform.UserAPI.getUser = async () => ({ username: "second-account" });
  const second = createExtension(f.host, f.deps);
  await f.flush();
  assert.deepEqual(second.state.draft.include, []);
  second.destroy();
});

test("tag filtering initializes even when the optional audio API has not loaded", async () => {
  const f = fixture();
  delete f.host.Spicetify.CosmosAsync;
  f.platform.History.location.pathname = "/collection/tracks";
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  assert.equal(f.counts().mounts, 1);
  extension.destroy();
});

test("native tag request overlap retries without the misleading load-or-save notification", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let calls = 0;
  f.platform.LibraryAPI.getTracksFilterTags = async () => {
    if (++calls === 1) throw new Error("DUPLICATE_REQUEST_ERROR: Already sent this request (GET::liked-songs)");
    return [{ name: "Chill", filter: "tags contains chill" }];
  };
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  assert.deepEqual(f.notifications, [], "An overlapping native request must not display the reported error toast");
  f.advance(1000); await f.flush();
  assert.equal(f.counts().mounts, 1, "Add Tag must mount after the native request completes");
  extension.destroy();
});

test("an unloaded extension cannot show a late request failure notification", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let reject;
  f.platform.LibraryAPI.getTracksFilterTags = () => new Promise((_, fail) => { reject = fail; });
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  extension.destroy();
  reject(new Error("DUPLICATE_REQUEST_ERROR: native page request is pending"));
  await f.flush();
  assert.deepEqual(f.notifications, []);
  assert.deepEqual(f.warnings, []);
});

test("leaving Liked Songs cancels late errors and allows a fresh tag request on return", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let reject;
  f.platform.LibraryAPI.getTracksFilterTags = () => new Promise((_, fail) => { reject = fail; });
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  f.navigate("/marketplace");
  reject(new Error("DUPLICATE_REQUEST_ERROR: native page request is pending"));
  await f.flush();
  assert.deepEqual(f.notifications, []);
  f.platform.LibraryAPI.getTracksFilterTags = async () => [{ name: "Chill", filter: "tags contains chill" }];
  f.navigate("/collection/tracks"); await f.flush();
  assert.equal(f.counts().mounts, 1);
  extension.destroy();
});

test("genuine tag failures still report the failing operation and retain saved state", async () => {
  const f = fixture();
  const extension = createExtension(f.host, f.deps);
  await f.flush();
  extension.state.draft.include.push("Chill");
  f.platform.LibraryAPI.getTracksFilterTags = async () => { throw new Error("Access denied"); };
  f.navigate("/collection/tracks"); await f.flush();
  assert.equal(f.notifications.length, 1);
  assert.match(f.notifications[0], /genre tags/i);
  assert.deepEqual(extension.state.draft.include, ["Chill"]);
  extension.destroy();
});

test("persistent duplicate requests have a bounded quiet retry period", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let requests = 0;
  f.platform.LibraryAPI.getTracksFilterTags = async () => {
    requests++;
    throw new Error("DUPLICATE_REQUEST_ERROR: previous request stuck");
  };
  const extension = createExtension(f.host, f.deps);
  for (let attempt = 0; attempt < 7; attempt++) { await f.flush(); f.advance(2000); }
  assert.equal(requests, 7);
  assert.equal(f.notifications.length, 1);
  assert.match(f.notifications[0], /genre tags/i);
  extension.destroy();
});

test("a replacement copy recovers while the unloaded copy's native request fails", async () => {
  const f = fixture();
  f.platform.History.location.pathname = "/collection/tracks";
  let rejectOld, calls = 0;
  f.platform.LibraryAPI.getTracksFilterTags = () => {
    if (++calls === 1) return new Promise((_, reject) => { rejectOld = reject; });
    if (calls === 2) return Promise.reject(new Error("DUPLICATE_REQUEST_ERROR: overlapping copy"));
    return Promise.resolve([{ name: "Chill", filter: "tags contains chill" }]);
  };
  createExtension(f.host, f.deps); await f.flush();
  const replacement = createExtension(f.host, f.deps); await f.flush();
  rejectOld(new Error("DUPLICATE_REQUEST_ERROR: old copy")); await f.flush();
  f.advance(1000); await f.flush();
  assert.deepEqual(f.notifications, []);
  assert.equal(f.counts().mounts, 1);
  assert.equal(f.host.LikedSongFilters, replacement);
  replacement.destroy();
});
