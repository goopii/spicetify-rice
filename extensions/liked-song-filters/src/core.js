// Dependency-free tag queries, paging, and audio-feature filters.
(function (root) {
  "use strict";

  function compile(prompt, tags) {
    let remaining = prompt.trim().toLowerCase();
    if (!remaining) throw new Error("Type a tag or combination first.");
    const names = [...tags].sort((a, b) => b.name.length - a.name.length);
    const tokens = [];
    while (remaining) {
      remaining = remaining.trimStart();
      if (!remaining) break;
      const op = remaining.match(/^(and|or|without|not)\b/);
      if (op) {
        tokens.push({ type: op[1] });
        remaining = remaining.slice(op[0].length);
        continue;
      }
      const tag = names.find(({ name }) => {
        const label = name.toLowerCase();
        return remaining.startsWith(label) && (!remaining[label.length] || /\s/.test(remaining[label.length]));
      });
      if (!tag) throw new Error(`Unrecognized words: “${remaining}”. Try the available tags with and, or, or without.`);
      tokens.push({ type: "tag", tag });
      remaining = remaining.slice(tag.name.length);
    }
    let cursor = 0;
    function atom() {
      const token = tokens[cursor++];
      if (token?.type === "not") return { type: "not", child: atom() };
      if (token?.type !== "tag") throw new Error("Expected a tag after the operator.");
      return { type: "tag", tag: token.tag };
    }
    function conjunction() {
      let node = atom();
      while (cursor < tokens.length && tokens[cursor].type !== "or") {
        let op = tokens[cursor].type;
        if (op === "and" || op === "without") cursor++;
        else if (op !== "tag" && op !== "not") throw new Error("Expected and, or, or without.");
        const child = atom();
        node = { type: "and", left: node, right: op === "without" ? { type: "not", child } : child };
      }
      return node;
    }
    let tree = conjunction();
    while (cursor < tokens.length) {
      cursor++;
      tree = { type: "or", left: tree, right: conjunction() };
    }
    return tree;
  }

  function describe(node) {
    if (node.type === "tag") return node.tag.name;
    if (node.type === "not") return `NOT ${describe(node.child)}`;
    return `(${describe(node.left)} ${node.type.toUpperCase()} ${describe(node.right)})`;
  }

  function filters(node) {
    if (node.type === "tag") return [node.tag.filter];
    if (node.type === "not") return filters(node.child);
    return [...new Set([...filters(node.left), ...filters(node.right)])];
  }

  function matches(node, uri, sets) {
    if (node.type === "tag") return sets.get(node.tag.filter).has(uri);
    if (node.type === "not") return !matches(node.child, uri, sets);
    return node.type === "and"
      ? matches(node.left, uri, sets) && matches(node.right, uri, sets)
      : matches(node.left, uri, sets) || matches(node.right, uri, sets);
  }

  async function collect(getPage, filters = [], options = {}) {
    const pageSize = options.pageSize ?? 1000;
    const maxTracks = options.maxTracks ?? 20000;
    const items = [], seen = new Set();
    const reportedTotals = new Set();
    let requests = 0;
    for (let offset = 0; offset <= maxTracks; offset += pageSize) {
      options.signal?.throwIfAborted();
      const page = await getPage({ offset, limit: pageSize, filters });
      options.signal?.throwIfAborted();
      requests++;
      if (!Array.isArray(page.items)) throw new Error("Spotify returned an invalid track page.");
      reportedTotals.add(page.totalLength);
      if (page.items.length && page.items.every((item) => seen.has(item.uri))) {
        throw new Error("Spotify repeated a page; the result would be incomplete.");
      }
      for (const item of page.items) {
        if (!seen.has(item.uri)) { seen.add(item.uri); items.push(item); }
      }
      if (items.length > maxTracks) throw new Error(`Collection limit exceeded (${maxTracks} tracks).`);
      options.onPage?.({ requests, count: items.length });
      if (page.items.length < pageSize) return { items, requests, reportedTotals: [...reportedTotals] };
    }
    throw new Error("Paging limit reached; refusing to show partial results as complete.");
  }

  function reader(platform) {
    const uri = platform.LibraryAPI?._likedSongsUri;
    if (!uri || !platform.PlaylistAPI?.getContents) throw new Error("The native Liked Songs API is unavailable in this Spotify build.");
    return ({ offset, limit, filters = [] }) => platform.PlaylistAPI.getContents(uri, {
      offset, limit,
      descriptorFilter: filters.map((filter) => {
        if (!filter.startsWith("tags contains ")) throw new Error("Only native tag filters are supported by this extension.");
        return filter.slice(14);
      }),
    });
  }

  function parseQuery(prompt, tags) {
    const clause = prompt.trim().match(/^(.*?)\s+with\s+(energy|valence|danceability|acousticness|instrumentalness|tempo)\s+(below|above)\s+(\d*\.?\d+)$/i);
    if (!clause) return { tree: compile(prompt, tags), feature: null };
    const [, base, field, operator, number] = clause;
    const value = Number(number);
    const maximum = field.toLowerCase() === "tempo" ? 300 : 1;
    if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`${field} must be between 0 and ${maximum}.`);
    return { tree: compile(base, tags), feature: { field: field.toLowerCase(), operator: operator.toLowerCase(), value } };
  }

  function matchesFeature(rule, data) {
    if (!data || typeof data[rule.field] !== "number") return false;
    return rule.operator === "below" ? data[rule.field] < rule.value : data[rule.field] > rule.value;
  }

  async function collectFeatures(tracks, getBatch, cache = new Map(), options = {}) {
    if (tracks.length > 20000) throw new Error("This extension supports at most 20,000 candidate songs.");
    const missing = tracks.filter((track) => !cache.has(track.uri));
    for (let offset = 0; offset < missing.length; offset += 100) {
      options.signal?.throwIfAborted();
      const batch = missing.slice(offset, offset + 100);
      const response = await getBatch(batch.map((track) => track.uri.split(":").pop()));
      if (!Array.isArray(response?.audio_features) || response.audio_features.length !== batch.length) {
        throw new Error("Spotify did not return the complete audio-feature batch. Try again later.");
      }
      for (let index = 0; index < batch.length; index++) {
        const data = response.audio_features[index];
        if (data && data.id !== batch[index].uri.split(":").pop()) throw new Error("Spotify returned an unexpected audio-feature order.");
        cache.set(batch[index].uri, data);
      }
      options.onProgress?.({ completed: tracks.length - missing.length + Math.min(offset + 100, missing.length), total: tracks.length });
    }
    options.signal?.throwIfAborted();
    return cache;
  }

  const featureDefinitions = [
    { field: "energy", label: "Energy", hint: "Gentle → intense", min: 0, max: 1, step: 0.01 },
    { field: "valence", label: "Mood", hint: "Somber → bright · Spotify’s valence", min: 0, max: 1, step: 0.01 },
    { field: "danceability", label: "Danceability", hint: "Less rhythmic → more danceable", min: 0, max: 1, step: 0.01 },
    { field: "tempo", label: "Tempo", hint: "Beats per minute", min: 0, max: 300, step: 1, unit: "BPM" },
    { field: "acousticness", label: "Acousticness", hint: "Less → more acoustic", min: 0, max: 1, step: 0.01 },
    { field: "instrumentalness", label: "Instrumentalness", hint: "Vocals → instrumental", min: 0, max: 1, step: 0.01 },
    { field: "speechiness", label: "Speechiness", hint: "Music → spoken word", min: 0, max: 1, step: 0.01 },
    { field: "liveness", label: "Liveness", hint: "Less → more likely a live recording", min: 0, max: 1, step: 0.01 },
    { field: "loudness", label: "Loudness", hint: "Average recording level", min: -60, max: 0, step: 1, unit: "dB" },
  ];

  function selection(input, tags) {
    const resolve = (names) => [...new Set(names ?? [])].map((name) => {
      const tag = tags.find((item) => item.name.toLowerCase() === String(name).toLowerCase());
      if (!tag) throw new Error(`Unknown tag: ${name}`);
      return tag;
    });
    const include = resolve(input.include), exclude = resolve(input.exclude);
    if (include.some((tag) => exclude.includes(tag))) throw new Error("A tag cannot be both included and excluded.");
    const mode = input.mode ?? "all";
    if (mode !== "all" && mode !== "any") throw new Error("Choose all or any included tags.");
    const ranges = {};
    for (const [field, bounds] of Object.entries(input.ranges ?? {})) {
      const definition = featureDefinitions.find((item) => item.field === field);
      if (!definition || !Array.isArray(bounds) || bounds.length !== 2 || bounds.some((value) => !Number.isFinite(value))
        || bounds[0] < definition.min || bounds[1] > definition.max || bounds[0] > bounds[1]) throw new Error(`Invalid ${field} range.`);
      ranges[field] = [...bounds];
    }
    return { include, exclude, mode, ranges };
  }

  function matchesSelection(value, uri, sets) {
    const included = value.include.length === 0 || (value.mode === "all"
      ? value.include.every((tag) => sets.get(tag.filter).has(uri))
      : value.include.some((tag) => sets.get(tag.filter).has(uri)));
    return included && !value.exclude.some((tag) => sets.get(tag.filter).has(uri));
  }

  function matchesRanges(ranges, data) {
    return Object.entries(ranges).every(([field, [min, max]]) =>
      Number.isFinite(data?.[field]) && data[field] >= min && data[field] <= max);
  }

  function formatRange(definition, [min, max]) {
    return definition.unit ? `${min}–${max} ${definition.unit}` : `${Math.round(min * 100)}–${Math.round(max * 100)}%`;
  }

  function describeSelection(value) {
    const parts = [value.include.map((tag) => tag.name).join(value.mode === "all" ? " + " : " or ") || "All liked songs"];
    if (value.exclude.length) parts.push(`without ${value.exclude.map((tag) => tag.name).join(" or ")}`);
    for (const [field, bounds] of Object.entries(value.ranges)) {
      const definition = featureDefinitions.find((item) => item.field === field);
      parts.push(`${definition.label} ${formatRange(definition, bounds)}`);
    }
    return parts.join(" · ");
  }

  const api = { compile, describe, filters, matches, collect, reader, parseQuery, matchesFeature, collectFeatures,
    featureDefinitions, selection, matchesSelection, matchesRanges, formatRange, describeSelection };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LikedSongsProbeCore = api;
})(globalThis);
