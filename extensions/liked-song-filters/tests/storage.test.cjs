const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const { createStore } = require("../src/storage.js");

function storage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
const draft = { include: ["Chill"], exclude: ["Sad"], mode: "any", ranges: { energy: [0.2, 0.4] } };
const filter = { name: "Gentle", spec: { kind: "builder", value: draft }, label: "Gentle music" };

test("drafts, named rules, and deletion survive separate extension instances", () => {
  const disk = storage();
  const first = createStore(disk, "library-a", core);
  assert.equal(first.save({ version: 1, draft, saved: [filter] }), true);
  const reopened = createStore(disk, "library-a", core).load();
  assert.deepEqual(reopened.draft, draft);
  assert.deepEqual(reopened.saved, [filter]);
  reopened.saved.splice(0, 1);
  first.save(reopened);
  assert.deepEqual(createStore(disk, "library-a", core).load().saved, []);
  assert.deepEqual(createStore(disk, "library-b", core).load().saved, []);
});

test("corrupt storage and invalid saved rules do not prevent loading valid filters", () => {
  const disk = storage(), errors = [];
  const store = createStore(disk, "rules", core, (error) => errors.push(error));
  disk.setItem("rules", "not json");
  assert.deepEqual(store.load().saved, []);
  assert.equal(errors.length, 1);
  disk.setItem("rules", JSON.stringify({ version: 1, draft: { ranges: { energy: [4, 5] } },
    saved: [filter, { ...filter, name: "Broken", spec: { kind: "builder", value: { ranges: { nope: [0, 1] } } } }] }));
  const result = store.load();
  assert.deepEqual(result.saved, [filter]);
  assert.deepEqual(result.draft.ranges, {});
  disk.setItem("rules", JSON.stringify({ version: 1, draft: { include: "Chill" }, saved: [filter] }));
  assert.deepEqual(store.load().draft.include, []);
});

test("only rules are persisted, and full/unavailable storage is reported", () => {
  const disk = storage();
  const store = createStore(disk, "rules", core);
  store.save({ version: 1, draft, saved: [filter], tracks: ["private library data"], token: "never-store" });
  assert.equal(disk.getItem("rules").includes("private library data"), false);
  assert.equal(disk.getItem("rules").includes("never-store"), false);
  const errors = [];
  const unavailable = createStore({ setItem() { throw new Error("Quota exceeded"); } }, "rules", core, (e) => errors.push(e));
  assert.equal(unavailable.save({ version: 1, draft, saved: [filter] }), false);
  assert.equal(errors[0].message, "Quota exceeded");
});

test("prompt pills round-trip without depending on currently suggested tags", () => {
  const disk = storage(), store = createStore(disk, "rules", core);
  const saved = [{ name: "Jazz", spec: { kind: "prompt", prompt: "jazz without sad" }, label: "Jazz without sad" }];
  store.save({ version: 1, draft, saved });
  assert.deepEqual(store.load().saved, saved);
});
