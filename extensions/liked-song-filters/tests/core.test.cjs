const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const tags = ["Chill", "Electronic", "Sad", "Hip Hop", "Jazz", "Funk"].map((name) => ({ name, filter: `tags contains ${name.toLowerCase()}` }));
const sets = new Map(tags.map(({ name, filter }) => [filter, new Set({ Chill: ["a", "b"], Electronic: ["b", "c"], Sad: ["b"], "Hip Hop": ["a"], Jazz: ["c"], Funk: ["a"] }[name])]));
const query = (text) => ["a", "b", "c"].filter((uri) => core.matches(core.compile(text, tags), uri, sets));

test("multiword tags, implicit AND, OR, exclusion, and precedence", () => {
  assert.deepEqual(query("chill electronic"), ["b"]);
  assert.deepEqual(query("CHILL and electronic"), ["b"]);
  assert.deepEqual(query("hip hop without sad"), ["a"]);
  assert.deepEqual(query("chill without sad"), ["a"]);
  assert.deepEqual(query("jazz or funk"), ["a", "c"]);
  assert.deepEqual(query("not chill"), ["c"]);
  assert.deepEqual(query("hip hop or chill and electronic"), ["a", "b"]);
});

test("unsupported language and malformed expressions never silently broaden results", () => {
  for (const prompt of ["", "chill for rainy days", "electronicish", "chill or", "and chill", "chill without", "hip hop and or sad"]) {
    assert.throws(() => core.compile(prompt, tags), undefined, prompt);
  }
});

test("paging ignores broken zero totals and counts the actual collection", async () => {
  const items = Array.from({ length: 5 }, (_, n) => ({ uri: String(n) }));
  const offsets = [];
  const result = await core.collect(async ({ offset, limit }) => {
    offsets.push(offset);
    return { totalLength: 0, items: items.slice(offset, offset + limit) };
  }, [], { pageSize: 2 });
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.equal(result.items.length, 5);
  assert.deepEqual(result.reportedTotals, [0]);
});

test("paging handles exact-size collections and rejects repetitions or truncation", async () => {
  const items = [{ uri: "a" }, { uri: "b" }];
  const exact = await core.collect(async ({ offset }) => ({ items: offset ? [] : items }), [], { pageSize: 2 });
  assert.equal(exact.requests, 2);
  await assert.rejects(core.collect(async () => ({ items }), [], { pageSize: 2 }), /repeated/);
  await assert.rejects(core.collect(async ({ offset }) => ({ items: [{ uri: String(offset) }, { uri: String(offset + 1) }] }), [], { pageSize: 2, maxTracks: 3 }), /limit exceeded/);
});

test("native reader passes descriptors to the complete playlist API", async () => {
  let request;
  const read = core.reader({ LibraryAPI: { _likedSongsUri: "spotify:collection:tracks" }, PlaylistAPI: {
    getContents: async (...args) => { request = args; return { items: [], totalLength: 0 }; },
  } });
  await read({ offset: 20, limit: 10, filters: ["tags contains hip hop", "tags contains chill"] });
  assert.deepEqual(request, ["spotify:collection:tracks", { offset: 20, limit: 10, descriptorFilter: ["hip hop", "chill"] }]);
  assert.throws(() => read({ filters: ["some text"] }), /Only native/);
});

test("numeric prompts enforce units, bounds, strict comparisons, and missing data", () => {
  const { feature } = core.parseQuery("chill electronic with energy below 0.4", tags);
  assert.equal(core.matchesFeature(feature, { energy: 0.3 }), true);
  assert.equal(core.matchesFeature(feature, { energy: 0.4 }), false);
  assert.equal(core.matchesFeature(feature, null), false);
  assert.equal(core.matchesFeature(core.parseQuery("chill with tempo above 100", tags).feature, { tempo: 120 }), true);
  assert.throws(() => core.parseQuery("chill with energy below 40", tags), /between 0 and 1/);
  assert.throws(() => core.parseQuery("chill with tempo above 900", tags), /between 0 and 300/);
});

test("feature batches reuse cache, handle missing features, and reject partial responses", async () => {
  const tracks = Array.from({ length: 102 }, (_, i) => ({ uri: `spotify:track:${i}` }));
  const batches = [];
  const fetchBatch = async (ids) => {
    batches.push(ids.length);
    return { audio_features: ids.map((id) => id === "0" ? null : { id, energy: 0.3 }) };
  };
  const cache = await core.collectFeatures(tracks, fetchBatch);
  await core.collectFeatures(tracks, fetchBatch, cache);
  assert.deepEqual(batches, [100, 2]);
  assert.equal(cache.get("spotify:track:0"), null);
  await assert.rejects(core.collectFeatures(tracks, async () => ({ error: {} })), /complete/);
  await assert.rejects(core.collectFeatures(tracks, async () => ({ audio_features: [{ id: "wrong" }] })), /complete/);
});

test("builder matches all/any includes and any exclusions, including exclusion-only filters", () => {
  const match = (value) => ["a", "b", "c"].filter((uri) => core.matchesSelection(core.selection(value, tags), uri, sets));
  assert.deepEqual(match({ include: ["Chill", "Electronic"] }), ["b"]);
  assert.deepEqual(match({ include: ["Chill", "Electronic"], mode: "any", exclude: ["Sad"] }), ["a", "c"]);
  assert.deepEqual(match({ exclude: ["Sad", "Jazz"] }), ["a"]);
  assert.deepEqual(match({}), ["a", "b", "c"]);
  assert.throws(() => core.selection({ include: ["Chill"], exclude: ["chill"] }, tags), /both/);
  assert.throws(() => core.selection({ include: ["not a real tag"] }, tags), /Unknown/);
});

test("multiple audio ranges use inclusive bounds, reject missing data, and validate inputs", () => {
  const value = core.selection({ ranges: { energy: [0.2, 0.4], tempo: [80, 120], loudness: [-30, -5] } }, tags);
  assert.equal(core.matchesRanges(value.ranges, { energy: 0.4, tempo: 80, loudness: -5 }), true);
  assert.equal(core.matchesRanges(value.ranges, { energy: 0.3, tempo: 121, loudness: -10 }), false);
  assert.equal(core.matchesRanges(value.ranges, { energy: 0.3, tempo: 100 }), false);
  assert.equal(core.matchesRanges({}, null), true);
  for (const ranges of [{ energy: [0.8, 0.2] }, { tempo: [0, 400] }, { valence: [0, NaN] }, { madeUp: [0, 1] }]) {
    assert.throws(() => core.selection({ ranges }, tags), /Invalid/);
  }
  assert.match(core.describeSelection(value), /Energy 20–40%/);
});

test("audio indexing can stop after the current batch and reuse the completed cache", async () => {
  const controller = new AbortController(), cache = new Map();
  const tracks = Array.from({ length: 201 }, (_, i) => ({ uri: `spotify:track:${i}` }));
  let calls = 0;
  await assert.rejects(core.collectFeatures(tracks, async (ids) => {
    calls++;
    return { audio_features: ids.map((id) => ({ id, energy: 0.3 })) };
  }, cache, { signal: controller.signal, onProgress: () => controller.abort() }), { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(cache.size, 100);
});
