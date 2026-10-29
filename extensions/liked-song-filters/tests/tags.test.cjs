const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTagCatalog, tagSuggestions } = require("../src/tags.js");

function fixture() {
  const state = { draft: { include: [], exclude: [] }, saved: [], knownTags: [] };
  const queries = []; let saves = 0;
  const platform = { LibraryAPI: { _likedSongsUri: "spotify:collection:tracks" }, PlaylistAPI: {
    async getContents(uri, options) {
      queries.push({ uri, options });
      return { items: options.descriptorFilter[0] === "r&b" ? [{ uri: "spotify:track:example" }] : [] };
    },
  } };
  return { state, queries, platform, persist: () => { saves++; }, saves: () => saves };
}

test("RnB checks the supported r&b descriptor, not the unsupported rnb spelling", async () => {
  const f = fixture(), catalog = createTagCatalog([], f.platform, f.state, f.persist);
  const tag = await catalog.lookup("RnB");
  assert.equal(tag.name, "R&B");
  assert.equal(tag.filter, "tags contains r&b");
  assert.deepEqual(f.queries[0].options, { offset: 0, limit: 1, descriptorFilter: ["r&b"] });
  assert.equal(tagSuggestions(catalog.tags, "rnb")[0], tag);
  assert.equal(await catalog.lookup("rhythm and blues"), tag);
  assert.equal(f.queries.length, 1);
});

test("all matching suggestions are available, including entries beyond eight", () => {
  const tags = Array.from({ length: 20 }, (_, index) => ({ name: `Genre ${index}` }));
  assert.equal(tagSuggestions(tags, "").length, 20);
  assert.equal(tagSuggestions(tags, "Genre", ["Genre 9"]).length, 19);
});

test("only matching typed tags are added; concurrent and repeated checks share requests", async () => {
  const f = fixture(), catalog = createTagCatalog([], f.platform, f.state, f.persist);
  const matches = await Promise.all([catalog.lookup("RnB"), catalog.lookup("R&B")]);
  assert.equal(matches[0], matches[1]);
  assert.equal(f.queries.length, 1);
  catalog.remember(matches[0]); catalog.remember(matches[1]);
  assert.equal(f.saves(), 1);
  assert.deepEqual(f.state.knownTags, ["R&B"]);
  assert.equal(await catalog.lookup("Made-up tag"), null);
  assert.equal(await catalog.lookup("Made-up tag"), null);
  assert.equal(f.queries.length, 2);
  assert.equal(catalog.tags.length, 1);
});

test("discovered and saved tags remain usable when Spotify stops suggesting them", () => {
  const f = fixture();
  f.state.knownTags = ["R&B"];
  f.state.draft.include = ["Ambient"];
  f.state.saved = [{ spec: { kind: "builder", value: { include: ["Soul"], exclude: ["Metal"] } } }];
  const catalog = createTagCatalog([], f.platform, f.state, f.persist);
  assert.deepEqual(catalog.tags.map((tag) => tag.name), ["R&B", "Ambient", "Soul", "Metal"]);
  assert.equal(f.queries.length, 0);
});
