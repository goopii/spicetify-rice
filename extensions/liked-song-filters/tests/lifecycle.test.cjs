const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const { createStore } = require("../src/storage.js");
const { createExtension } = require("../src/lifecycle.js");

function fixture() {
  const tasks = new Map(), disk = new Map();
  let serial = 0, listener, observer, mounts = 0, destroys = 0, disconnected = false;
  let page = {};
  const platform = { History: { location: { pathname: "/search" }, listen(fn) { listener = fn; return () => { listener = null; }; } },
    LibraryAPI: { _likedSongsUri: "spotify:user:test:collection", getTracksFilterTags: async () => [{ name: "Chill", filter: "tags contains chill" }] },
    PlaylistAPI: { getContents() {} } };
  const host = { Date, console, document: { body: {}, querySelector: () => page },
    localStorage: { getItem: (key) => disk.get(key), setItem: (key, value) => disk.set(key, value) },
    Spicetify: { Platform: platform, CosmosAsync: { get() {} } },
    setTimeout(fn) { tasks.set(++serial, fn); return serial; }, clearTimeout(id) { tasks.delete(id); },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { disconnected = true; } } };
  const deps = { core, createStore, version: "test", mountPanel({ state, persist }) {
    mounts++;
    return { page, panel: { isConnected: true }, toggle: { isConnected: true }, state, persist, destroy() { destroys++; } };
  } };
  async function flush() {
    const pending = [...tasks.values()]; tasks.clear();
    pending.forEach((fn) => fn());
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { host, deps, platform, tasks, flush, navigate(path) { platform.History.location.pathname = path; listener?.(); },
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
