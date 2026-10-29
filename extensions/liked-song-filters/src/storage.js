// Persist only filter rules. Library contents and audio features stay in memory.
function createStore(storage, key, core, onError = () => {}) {
  const emptyDraft = () => ({ include: [], exclude: [], mode: "all", ranges: {} });
  const empty = () => ({ version: 1, draft: emptyDraft(), saved: [] });
  function draft(value) {
    if (!value || typeof value !== "object") throw new Error("Invalid filter");
    if ((value.include !== undefined && !Array.isArray(value.include))
      || (value.exclude !== undefined && !Array.isArray(value.exclude))) throw new Error("Invalid tag lists");
    const names = [...(value.include ?? []), ...(value.exclude ?? [])];
    if (names.length > 64 || names.some((name) => typeof name !== "string" || !name || name.length > 80)) {
      throw new Error("Invalid tags");
    }
    const tags = names.map((name) => ({ name, filter: `tags contains ${name.toLowerCase()}` }));
    const result = core.selection(value, tags);
    return { include: result.include.map((tag) => tag.name), exclude: result.exclude.map((tag) => tag.name),
      mode: result.mode, ranges: result.ranges };
  }
  function normalize(value) {
    if (value?.version !== 1) throw new Error("Unsupported filter storage version");
    const result = empty();
    try { result.draft = draft(value.draft); } catch { /* A damaged draft must not hide valid saved pills. */ }
    for (const item of Array.isArray(value.saved) ? value.saved.slice(0, 100) : []) {
      try {
        if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 100) continue;
        let spec;
        if (item.spec?.kind === "builder") spec = { kind: "builder", value: draft(item.spec.value) };
        else if (item.spec?.kind === "prompt" && typeof item.spec.prompt === "string"
          && item.spec.prompt.trim() && item.spec.prompt.length <= 160) {
          spec = { kind: "prompt", prompt: item.spec.prompt };
        } else continue;
        if (!result.saved.some((saved) => saved.name === item.name)) {
          result.saved.push({ name: item.name, spec, label: typeof item.label === "string" ? item.label.slice(0, 2000) : item.name });
        }
      } catch { /* Skip one invalid saved filter without losing the others. */ }
    }
    return result;
  }
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw ? normalize(JSON.parse(raw)) : empty();
      } catch (error) { onError(error, "load"); return empty(); }
    },
    save(value) {
      try { storage.setItem(key, JSON.stringify(normalize(value))); return true; }
      catch (error) { onError(error, "save"); return false; }
    },
  };
}

module.exports = { createStore };
