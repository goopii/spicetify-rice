// Spotify's suggested pills are not its full descriptor vocabulary. Check exact
// user-entered tags against the library instead of treating suggestions as a whitelist.
const rnbAliases = ["rnb", "r&b", "r and b", "rhythm and blues"];
function canonicalTagName(value) {
  const name = String(value).normalize("NFKC").trim().replace(/\s+/g, " ");
  return rnbAliases.includes(name.toLowerCase()) ? "R&B" : name;
}
function tagSuggestions(tags, value, selected = []) {
  const query = canonicalTagName(value).toLowerCase();
  return tags.filter((tag) => !selected.includes(tag.name)
    && [tag.name, ...(tag.aliases ?? [])].some((name) => name.toLowerCase().includes(query)));
}
function createTagCatalog(native, platform, state, persist) {
  const tags = [], checked = new Map(), pending = new Map();
  function register(name, filter) {
    name = canonicalTagName(name);
    if (!name || name.length > 80) return null;
    const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const tag = { name, filter: filter ?? `tags contains ${name.toLowerCase()}` };
    if (name === "R&B") tag.aliases = rnbAliases;
    tags.push(tag);
    return tag;
  }
  native.forEach((tag) => register(tag.name, tag.filter));
  const savedBuilderNames = state.saved.flatMap((item) => item.spec.kind === "builder"
    ? [...item.spec.value.include, ...item.spec.value.exclude] : []);
  [...(state.knownTags ?? []), ...state.draft.include, ...state.draft.exclude, ...savedBuilderNames].forEach((name) => register(name));
  return {
    tags,
    find: (value) => tags.find((tag) => tag.name.toLowerCase() === canonicalTagName(value).toLowerCase()),
    suggest: (value, selected) => tagSuggestions(tags, value, selected),
    remember(tag) {
      state.knownTags ??= [];
      if (!state.knownTags.includes(tag.name)) { state.knownTags.push(tag.name); persist(); }
    },
    async lookup(value) {
      const name = canonicalTagName(value);
      if (!name || name.length > 80) return null;
      const key = name.toLowerCase();
      const existing = tags.find((tag) => tag.name.toLowerCase() === key);
      if (existing) return existing;
      if (checked.has(key)) return checked.get(key);
      if (!pending.has(key)) pending.set(key, (async () => {
        const result = await platform.PlaylistAPI.getContents(platform.LibraryAPI._likedSongsUri,
          { offset: 0, limit: 1, descriptorFilter: [key] });
        if (!Array.isArray(result.items)) throw new Error("Spotify returned an invalid tag check.");
        const tag = result.items.length ? register(name) : null;
        checked.set(key, tag);
        return tag;
      })().finally(() => pending.delete(key)));
      return pending.get(key);
    },
  };
}

module.exports = { canonicalTagName, tagSuggestions, createTagCatalog };
