// The builder mounts only on Liked Songs; its data belongs to the extension lifecycle.
function mountPanel({ core, platform, tags, catalog, state, cache, featureCache, persist }) {
  const { saved, draft } = state;
  const page = document.querySelector('.Root__main-view [data-testid="playlist-page"]');
  if (!page || platform.History.location.pathname !== "/collection/tracks") return null;
  const translations = platform.Translations ?? {};
  const downloadLabels = new Set([translations["download.download"], translations["download.remove"], translations["download.complete"],
    translations["web-player.your-library-x.download-progress-title"], "Download", "Remove download", "Downloading"].filter(Boolean));
  const download = [...page.querySelectorAll("button")].find((button) => downloadLabels.has(button.getAttribute("aria-label")));
  if (!download) return null;
  const panel = document.createElement("section");
  panel.id = "liked-song-filters";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Custom Liked Songs filters");
  panel.innerHTML = `
    <header><div><h2>Make your own mix</h2><p>Choose the tags and sound you want from your Liked Songs.</p></div><button type="button" data-action="close" aria-label="Close tag builder">×</button></header>
    <div class="rlp-pills" aria-label="Saved custom filters"></div>
    <div class="rlp-layout">
      <div class="rlp-tag-column">
        <section class="rlp-tag-group" data-list="include"><div class="rlp-section-heading"><label for="rlp-include">Include tags</label><select aria-label="Match included tags"><option value="all">Match all</option><option value="any">Match any</option></select></div><p class="rlp-help">Add the genres and moods you want.</p><div class="rlp-autocomplete"><input id="rlp-include" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rlp-include-options" placeholder="Try chill, electronic, jazz…" autocomplete="off" maxlength="80"><ul id="rlp-include-options" role="listbox" aria-label="Include tag suggestions" hidden></ul></div><div class="rlp-chips" aria-label="Included tags"></div></section>
        <section class="rlp-tag-group" data-list="exclude"><label for="rlp-exclude">Exclude tags</label><p class="rlp-help">Leave out songs matching any of these tags.</p><div class="rlp-autocomplete"><input id="rlp-exclude" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rlp-exclude-options" placeholder="Tags to leave out…" autocomplete="off" maxlength="80"><ul id="rlp-exclude-options" role="listbox" aria-label="Exclude tag suggestions" hidden></ul></div><div class="rlp-chips rlp-excluded" aria-label="Excluded tags"></div></section>
        <p class="rlp-tag-feedback" role="status" aria-live="polite">Choose a suggestion, or type another tag to check your Liked Songs.</p>
        <details class="rlp-advanced"><summary>Write a filter instead</summary><form><label for="rice-pill-prompt">Describe your filter</label><div class="rlp-prompt-row"><input id="rice-pill-prompt" placeholder="chill electronic with energy below 0.4" autocomplete="off" maxlength="160"><button type="submit">Try filter</button></div></form><p class="rlp-help">Use tags with and, or, or without. Add “with energy below 0.4” or another numeric rule.</p></details>
      </div>
      <section class="rlp-audio"><div class="rlp-section-heading"><h3>Fine-tune the sound</h3><button type="button" data-action="reset-audio" class="rlp-text-button">Reset audio</button></div><p class="rlp-help">Enable a feature, then set its minimum and maximum.</p><div class="rlp-feature-grid rlp-primary-features"></div><details class="rlp-more"><summary>More audio features</summary><div class="rlp-feature-grid rlp-extra-features"></div></details></section>
    </div>
    <div class="rlp-actions"><button type="button" data-action="preview" class="rlp-primary">Preview matches</button><button type="button" data-action="stop" hidden>Stop</button><button type="button" data-action="clear" class="rlp-text-button">Clear filters</button><div class="rlp-save"><label for="rlp-pill-name" class="rlp-sr-only">Custom pill name</label><input id="rlp-pill-name" placeholder="Name your pill (optional)" maxlength="100"><button type="button" data-action="save" disabled>Keep as pill</button></div></div>
    <p class="rlp-status" role="status" aria-live="polite">Preview your matches, then keep the filter as a pill. Saved pills stay after Spotify restarts.</p>
    <div class="rlp-results" hidden><p class="rlp-count"></p><ol aria-label="Matching liked songs"></ol></div>`;
  const style = document.createElement("style");
  style.textContent = `
    #rlp-add-tag{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:8px 16px;border:1px solid #777;border-radius:999px;background:transparent;color:#ddd;font:inherit;font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer}
    #rlp-add-tag:hover{border-color:#fff;color:#fff;background:#ffffff0a}
    #rlp-add-tag[aria-expanded=true]{background:#fff;color:#121212;border-color:#fff}
    #rlp-add-tag:focus-visible{outline:2px solid #fff;outline-offset:4px}
    #rlp-add-tag svg{width:16px;height:16px;flex:none}
    #liked-song-filters[hidden]{display:none!important}
    #liked-song-filters{margin:12px 24px 24px;padding:24px;background:#181818;border-radius:12px;color:#fff;box-shadow:0 4px 18px #0003;font-size:14px;line-height:1.45;font-family:inherit;container-type:inline-size}
    #liked-song-filters *{box-sizing:border-box}
    #liked-song-filters [hidden]{display:none!important}
    #liked-song-filters header,.rlp-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
    #liked-song-filters h2{font-size:22px;font-weight:700;margin:0 0 4px;text-wrap:balance}
    #liked-song-filters h3{font-size:15px;margin:0;font-weight:700}
    #liked-song-filters p{margin:0;text-wrap:pretty}
    #liked-song-filters header p,.rlp-help{color:#aaa;font-size:13px}
    #liked-song-filters button{border:0;border-radius:24px;min-height:40px;padding:8px 16px;background:#303030;color:#fff;font:inherit;font-weight:600;cursor:pointer}
    #liked-song-filters button:hover{background:#414141}
    #liked-song-filters button:disabled{opacity:.45;cursor:default}
    #liked-song-filters :is(button,input,select,summary):focus-visible{outline:2px solid #fff;outline-offset:3px}
    #liked-song-filters .rlp-primary,#liked-song-filters [type=submit]{background:#1ed760;color:#000;white-space:nowrap}
    #liked-song-filters :is(.rlp-primary,[type=submit]):hover{background:#3be477}
    #liked-song-filters [data-action=close]{width:40px;padding:0;font-size:24px;background:transparent;flex:none}
    #liked-song-filters label{display:block;font-weight:600}
    #liked-song-filters input:not([type=range]):not([type=checkbox]){width:100%;min-width:0;min-height:42px;border:1px solid #666;background:#242424;color:#fff;border-radius:6px;padding:8px 12px;font:inherit}
    #liked-song-filters input::placeholder{color:#a7a7a7}
    #liked-song-filters select{font:inherit;color:#ddd;background:#242424;border:1px solid #555;border-radius:6px;min-height:40px;padding:4px 10px}
    #liked-song-filters .rlp-pills{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 24px}
    #liked-song-filters .rlp-pills:empty{display:none}
    #liked-song-filters .rlp-saved-pill{display:inline-flex;align-items:center;gap:2px}
    #liked-song-filters .rlp-saved-pill>button:last-child{width:40px;padding:0;font-size:20px}
    #liked-song-filters .rlp-pills [aria-pressed=true]{background:#fff;color:#121212}
    #liked-song-filters .rlp-layout{display:grid;grid-template-columns:minmax(260px,.85fr) minmax(360px,1.25fr);gap:32px}
    #liked-song-filters .rlp-tag-group{margin-bottom:24px}
    #liked-song-filters .rlp-help{margin:6px 0 12px;line-height:1.5}
    #liked-song-filters .rlp-autocomplete{position:relative}
    #liked-song-filters [role=listbox]{position:absolute;z-index:20;top:calc(100% + 6px);left:0;right:0;list-style:none;margin:0;padding:6px;background:#292929;border-radius:8px;max-height:230px;overflow:auto;box-shadow:0 6px 24px #0007}
    #liked-song-filters [role=option]{padding:10px 12px;min-height:40px;border-radius:4px;cursor:pointer}
    #liked-song-filters [role=option][aria-selected=true]{background:#414141}
    #liked-song-filters .rlp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;min-height:0}
    #liked-song-filters .rlp-chip{display:inline-flex;align-items:center;gap:8px;padding:0 0 0 12px;border-radius:24px;background:#21432e;color:#e2f6e8}
    #liked-song-filters .rlp-excluded .rlp-chip{background:#432a2b;color:#f6dddd}
    #liked-song-filters .rlp-chip button{min-height:40px;width:40px;padding:0;background:transparent;color:inherit;font-size:20px}
    #liked-song-filters .rlp-chip button:hover{background:#ffffff18}
    #liked-song-filters .rlp-tag-feedback{font-size:12px;color:#aaa;min-height:36px}
    #liked-song-filters .rlp-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #liked-song-filters .rlp-feature{padding:14px;background:#222;border-radius:8px;min-width:0}
    #liked-song-filters .rlp-feature-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
    #liked-song-filters .rlp-feature-heading label{display:flex;align-items:center;gap:8px;min-height:28px}
    #liked-song-filters [type=checkbox]{width:16px;height:16px;accent-color:#1ed760;margin:0}
    #liked-song-filters output{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;color:#aaa}
    #liked-song-filters .rlp-feature:has(:checked) output{color:#fff}
    #liked-song-filters .rlp-feature .rlp-help{font-size:11px;margin:4px 0 6px}
    #liked-song-filters .rlp-range-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:center}
    #liked-song-filters .rlp-range-row label{font-size:11px;color:#aaa;font-weight:400}
    #liked-song-filters [type=range]{accent-color:#1ed760;width:100%;min-width:0;margin:0;height:26px;cursor:pointer}
    #liked-song-filters [type=range]:disabled{opacity:.3;cursor:default}
    #liked-song-filters details{margin-top:16px}
    #liked-song-filters summary{cursor:pointer;min-height:40px;padding:10px 0;color:#ddd;font-size:13px}
    #liked-song-filters .rlp-prompt-row{display:flex;gap:8px;margin:8px 0}
    #liked-song-filters .rlp-text-button{background:transparent;color:#bbb;font-size:12px;padding:8px}
    #liked-song-filters .rlp-text-button:hover{color:#fff;background:#ffffff0a}
    #liked-song-filters .rlp-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-top:1px solid #ffffff18;padding-top:20px;margin-top:24px}
    #liked-song-filters .rlp-save{display:flex;gap:8px;margin-left:auto;max-width:440px;flex:1;min-width:280px}
    #liked-song-filters .rlp-save button{white-space:nowrap}
    #liked-song-filters .rlp-status{font-size:13px;color:#aaa;margin-top:12px;min-height:20px}
    #liked-song-filters [data-error=true]{color:#ffada7}
    #liked-song-filters .rlp-results{margin-top:16px;border-top:1px solid #ffffff18;padding-top:12px}
    #liked-song-filters .rlp-count{font-weight:600;font-variant-numeric:tabular-nums;margin-bottom:8px}
    #liked-song-filters ol{margin:0;padding-left:28px;max-height:220px;overflow:auto}
    #liked-song-filters li{padding:6px 8px;color:#aaa}
    #liked-song-filters li strong{color:#fff;font-weight:500}
    #liked-song-filters li span{display:block;font-size:12px}
    #liked-song-filters .rlp-sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @container(max-width:800px){#liked-song-filters .rlp-layout{grid-template-columns:1fr;gap:20px}}
    @container(max-width:420px){#liked-song-filters .rlp-feature-grid{grid-template-columns:1fr}#liked-song-filters .rlp-save{min-width:0;flex-basis:100%}}
  `;
  document.head.append(style);
  const anchor = page.querySelector('[role="listbox"][aria-label="Liked Songs Filter Tags"]');
  if (anchor?.closest(".contentSpacing")) anchor.closest(".contentSpacing").after(panel);
  else page.prepend(panel);
  const toggle = document.createElement("button");
  toggle.id = "rlp-add-tag";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panel.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add Tag</span>';
  download.after(toggle);

  const status = panel.querySelector(".rlp-status"), results = panel.querySelector(".rlp-results");
  const save = panel.querySelector('[data-action="save"]'), preview = panel.querySelector('[data-action="preview"]');
  const stop = panel.querySelector('[data-action="stop"]'), promptInput = panel.querySelector("#rice-pill-prompt");
  const nameInput = panel.querySelector("#rlp-pill-name"), pills = panel.querySelector(".rlp-pills");
  const feedback = panel.querySelector(".rlp-tag-feedback");
  const autocompletes = [], rangeControls = new Map();
  let destroyed = false, busy = false, revision = 0, current = null, controller;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function setOpen(open, restoreFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      panel.querySelector("header").scrollIntoView({ block: "nearest" });
      panel.querySelector("#rlp-include").focus({ preventScroll: true });
    } else {
      autocompletes.forEach((field) => field.close());
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }
  }
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector('[data-action="close"]').addEventListener("click", () => setOpen(false, true));
  function dirty() {
    revision++;
    current = null;
    save.disabled = true;
    results.hidden = true;
    delete panel.dataset.count;
    status.dataset.error = "false";
    if (!busy) status.textContent = "Filters changed. Preview matches to update your mix.";
    for (const button of pills.querySelectorAll("[aria-pressed]")) button.setAttribute("aria-pressed", "false");
    persist();
  }

  function tagField(kind) {
    const group = panel.querySelector(`[data-list="${kind}"]`), input = group.querySelector("input");
    const list = group.querySelector('[role="listbox"]'), chips = group.querySelector(".rlp-chips");
    let suggestions = [], active = 0, lookupTimer, lookupRevision = 0;
    const close = () => {
      clearTimeout(lookupTimer); lookupRevision++;
      list.hidden = true; input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-busy", "false");
      input.removeAttribute("aria-activedescendant");
    };
    function refresh() {
      suggestions = catalog.suggest(input.value, [...draft.include, ...draft.exclude]);
      active = Math.min(active, Math.max(0, suggestions.length - 1));
      list.replaceChildren();
      suggestions.forEach((tag, index) => {
        const option = document.createElement("li");
        option.id = `rlp-${kind}-option-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === active));
        option.textContent = tag.name;
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("click", () => add(tag));
        list.append(option);
      });
      list.hidden = suggestions.length === 0;
      input.setAttribute("aria-expanded", String(suggestions.length > 0));
      if (suggestions.length) input.setAttribute("aria-activedescendant", `rlp-${kind}-option-${active}`);
      else input.removeAttribute("aria-activedescendant");
    }
    function render() {
      chips.replaceChildren();
      draft[kind].forEach((name) => {
        const chip = document.createElement("span");
        chip.className = "rlp-chip";
        const label = document.createElement("span");
        label.textContent = name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${name} from ${kind === "include" ? "included" : "excluded"} tags`);
        remove.addEventListener("click", () => {
          draft[kind] = draft[kind].filter((tag) => tag !== name);
          dirty(); render(); input.focus();
          feedback.textContent = `${name} removed from ${kind === "include" ? "included" : "excluded"} tags.`;
        });
        chip.append(label, remove); chips.append(chip);
      });
    }
    function add(tag) {
      if (!tag) {
        feedback.textContent = `No liked songs matched “${input.value.trim()}”. Try a different tag or spelling.`;
        feedback.dataset.error = "true";
        return;
      }
      if (draft.include.includes(tag.name) || draft.exclude.includes(tag.name)) {
        feedback.textContent = `${tag.name} is already selected. Remove its existing chip to move it.`;
        return;
      }
      catalog.remember(tag);
      draft[kind].push(tag.name);
      input.value = ""; dirty(); render(); close(); input.focus();
      feedback.dataset.error = "false";
      feedback.textContent = `${tag.name} ${kind === "include" ? "included" : "excluded"}.`;
    }
    async function discover(commit = false) {
      const value = input.value.trim();
      if (!value) return;
      const revision = ++lookupRevision;
      input.setAttribute("aria-busy", "true");
      feedback.dataset.error = "false"; feedback.textContent = `Checking your Liked Songs for “${value}”…`;
      try {
        const tag = await catalog.lookup(value);
        if (destroyed || revision !== lookupRevision) return;
        if (tag) catalog.remember(tag);
        if (commit) add(tag);
        else {
          refresh();
          feedback.textContent = tag ? `“${tag.name}” matches your Liked Songs. Press Enter to add it.`
            : `No liked songs matched “${value}”. Try a different tag or spelling.`;
        }
      } catch {
        if (!destroyed && revision === lookupRevision) {
          feedback.dataset.error = "true"; feedback.textContent = "Spotify could not check this tag. Press Enter to try again.";
        }
      } finally {
        if (revision === lookupRevision) input.setAttribute("aria-busy", "false");
      }
    }
    input.addEventListener("focus", () => { active = 0; refresh(); });
    input.addEventListener("input", () => {
      clearTimeout(lookupTimer); lookupRevision++; active = 0; refresh();
      if (input.value.trim() && !suggestions.length) lookupTimer = setTimeout(() => discover(), 350);
    });
    input.addEventListener("blur", close);
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (list.hidden) { active = 0; refresh(); }
        else if (suggestions.length) { active = (active + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length; refresh(); }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        clearTimeout(lookupTimer);
        const candidate = catalog.find(input.value) ?? (!list.hidden ? suggestions[active] : undefined);
        if (candidate) add(candidate); else discover(true);
      }
    });
    const field = { render, close, input };
    autocompletes.push(field);
    return field;
  }
  tagField("include"); tagField("exclude");

  core.featureDefinitions.forEach((definition, index) => {
    const { field, label, hint, min, max, step } = definition;
    const card = document.createElement("div");
    card.className = "rlp-feature"; card.dataset.feature = field;
    card.innerHTML = `<div class="rlp-feature-heading"><label><input type="checkbox" aria-label="Enable ${label.toLowerCase()} filter">${label}</label><output>Any</output></div><p class="rlp-help"></p><div class="rlp-range-row"><label for="rlp-${field}-min">Min</label><input id="rlp-${field}-min" type="range" aria-label="Minimum ${label.toLowerCase()}" min="${min}" max="${max}" step="${step}" value="${min}" disabled></div><div class="rlp-range-row"><label for="rlp-${field}-max">Max</label><input id="rlp-${field}-max" type="range" aria-label="Maximum ${label.toLowerCase()}" min="${min}" max="${max}" step="${step}" value="${max}" disabled></div>`;
    card.querySelector(".rlp-help").textContent = hint;
    const enabled = card.querySelector('[type="checkbox"]'), output = card.querySelector("output");
    const lower = card.querySelector('[id$="-min"]'), upper = card.querySelector('[id$="-max"]');
    let lastBounds = [min, max];
    function render(reset = false) {
      if (reset) lastBounds = [min, max];
      const bounds = draft.ranges[field];
      if (bounds) lastBounds = [...bounds];
      enabled.checked = !!bounds;
      lower.disabled = upper.disabled = !bounds;
      lower.value = lastBounds[0]; upper.value = lastBounds[1];
      output.textContent = bounds ? core.formatRange(definition, bounds) : "Any";
      for (const [control, value] of [[lower, Number(lower.value)], [upper, Number(upper.value)]]) {
        control.setAttribute("aria-valuetext", definition.unit ? `${value} ${definition.unit}` : `${Math.round(value * 100)} percent`);
      }
    }
    enabled.addEventListener("change", () => {
      if (enabled.checked) draft.ranges[field] = [Number(lower.value), Number(upper.value)];
      else delete draft.ranges[field];
      dirty(); render();
    });
    for (const [control, edge] of [[lower, 0], [upper, 1]]) control.addEventListener("input", () => {
      const bounds = [...draft.ranges[field]];
      bounds[edge] = Number(control.value);
      if (bounds[0] > bounds[1]) bounds[1 - edge] = bounds[edge];
      draft.ranges[field] = bounds;
      dirty(); render();
    });
    rangeControls.set(field, render);
    panel.querySelector(index < 4 ? ".rlp-primary-features" : ".rlp-extra-features").append(card);
  });

  function renderDraft() {
    autocompletes.forEach((field) => { field.render(); field.close(); field.input.value = ""; });
    panel.querySelector("select").value = draft.mode;
    rangeControls.forEach((render) => render(true));
    feedback.dataset.error = "false";
    feedback.textContent = "Choose a suggestion, or type another tag to check your Liked Songs.";
  }
  function loadDraft(value) {
    Object.assign(draft, clone(value));
    dirty(); renderDraft();
  }
  async function read(filters = []) {
    const key = JSON.stringify(filters);
    if (!cache.has(key)) cache.set(key, await core.collect(core.reader(platform), filters, { signal: controller.signal }));
    return cache.get(key);
  }
  async function execute(spec, label) {
    if (busy || destroyed) return;
    // Re-read native membership on every run; audio attributes themselves are
    // cached only in memory. Newly liked/removed songs appear on the next run.
    cache.clear();
    const runRevision = revision;
    busy = true; current = null; controller = new AbortController();
    save.disabled = preview.disabled = panel.querySelector('[type="submit"]').disabled = true;
    stop.hidden = false; results.hidden = true; status.dataset.error = "false";
    panel.setAttribute("aria-busy", "true");
    try {
      status.textContent = `Finding ${label}…`;
      const universe = await read();
      const selection = spec.kind === "builder" ? core.selection(spec.value, tags) : null;
      const parsed = spec.kind === "prompt" ? core.parseQuery(spec.prompt, tags) : null;
      const needed = selection ? [...new Set([...selection.include, ...selection.exclude].map((tag) => tag.filter))] : core.filters(parsed.tree);
      const sets = new Map();
      for (const filter of needed) {
        controller.signal.throwIfAborted();
        sets.set(filter, new Set((await read([filter])).items.map((track) => track.uri)));
      }
      const candidates = universe.items.filter((track) => selection
        ? core.matchesSelection(selection, track.uri, sets) : core.matches(parsed.tree, track.uri, sets));
      const ranges = selection?.ranges ?? {};
      const fields = selection ? Object.keys(ranges) : parsed.feature ? [parsed.feature.field] : [];
      let tracks = candidates, unknown = 0;
      if (fields.length) {
        const progress = ({ completed, total }) => { if (!destroyed) status.textContent = `Checking the sound of ${total.toLocaleString()} songs · ${completed.toLocaleString()} ready…`; };
        progress({ completed: candidates.filter((track) => featureCache.has(track.uri)).length, total: candidates.length });
        await core.collectFeatures(candidates, core.featureReader(platform, window.Spicetify.CosmosAsync),
          featureCache, { signal: controller.signal, onProgress: progress });
        unknown = candidates.filter((track) => fields.some((field) => !Number.isFinite(featureCache.get(track.uri)?.[field]))).length;
        tracks = candidates.filter((track) => selection ? core.matchesRanges(ranges, featureCache.get(track.uri)) : core.matchesFeature(parsed.feature, featureCache.get(track.uri)));
      }
      controller.signal.throwIfAborted();
      if (destroyed) return;
      if (runRevision !== revision) { status.textContent = "Filters changed. Preview matches to update your mix."; return; }
      const list = results.querySelector("ol"); list.replaceChildren();
      for (const track of tracks.slice(0, 20)) {
        const row = document.createElement("li"), title = document.createElement("strong"), artist = document.createElement("span");
        title.textContent = track.name;
        artist.textContent = (track.artists ?? []).map((item) => item.name).join(", ");
        if (fields.length) artist.textContent += ` · ${fields.map((field) => `${field} ${featureCache.get(track.uri)[field]}`).join(" · ")}`;
        row.append(title, artist); list.append(row);
      }
      results.querySelector(".rlp-count").textContent = `${tracks.length.toLocaleString()} matching songs · first ${Math.min(20, tracks.length)} shown`;
      results.hidden = false;
      status.textContent = `${label} · searched ${universe.items.length.toLocaleString()} liked songs.${unknown ? ` ${unknown} songs were missing audio data and were excluded.` : ""}`;
      current = { spec: clone(spec), label, count: tracks.length, unknown, revision };
      save.disabled = false; panel.dataset.count = String(tracks.length);
      return current;
    } catch (error) {
      if (!destroyed) {
        status.dataset.error = String(error.name !== "AbortError");
        status.textContent = error.name === "AbortError" ? "Preview stopped. Your filters are ready to try again." : String(error.message ?? "Spotify could not complete this filter.");
        delete panel.dataset.count;
      }
    } finally {
      busy = false; preview.disabled = panel.querySelector('[type="submit"]').disabled = false;
      stop.hidden = true; panel.setAttribute("aria-busy", "false");
    }
  }
  const runBuilder = () => {
    const value = clone(draft);
    try {
      return execute({ kind: "builder", value }, core.describeSelection(core.selection(value, tags)));
    } catch (error) {
      status.dataset.error = "true"; status.textContent = error.message;
    }
  };
  const run = (prompt) => { dirty(); return execute({ kind: "prompt", prompt: prompt.trim() }, prompt.trim()); };

  function renderSaved() {
    pills.replaceChildren();
    saved.forEach((item) => {
      const group = document.createElement("span"); group.className = "rlp-saved-pill";
      const button = document.createElement("button"); button.type = "button"; button.textContent = item.name;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", async () => {
        if (busy) return;
        nameInput.value = item.name;
        if (item.spec.kind === "builder") loadDraft(item.spec.value);
        else { promptInput.value = item.spec.prompt; dirty(); }
        const result = await execute(item.spec, item.label);
        if (result) button.setAttribute("aria-pressed", "true");
      });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×";
      remove.setAttribute("aria-label", `Delete saved filter ${item.name}`);
      remove.addEventListener("click", () => {
        const index = saved.indexOf(item);
        saved.splice(index, 1);
        if (!persist()) {
          saved.splice(index, 0, item);
          status.dataset.error = "true"; status.textContent = "Spotify could not delete this saved filter. Try again when storage is available.";
          return;
        }
        renderSaved();
        status.dataset.error = "false";
        status.textContent = `“${item.name}” deleted.`;
      });
      group.append(button, remove); pills.append(group);
    });
  }
  renderSaved(); renderDraft();
  panel.querySelector("select").addEventListener("change", (event) => { draft.mode = event.target.value; dirty(); });
  panel.querySelector('[data-action="reset-audio"]').addEventListener("click", () => { draft.ranges = {}; dirty(); rangeControls.forEach((render) => render(true)); });
  panel.querySelector('[data-action="clear"]').addEventListener("click", () => { controller?.abort(); loadDraft({ include: [], exclude: [], mode: "all", ranges: {} }); nameInput.value = ""; });
  preview.addEventListener("click", () => { autocompletes.forEach((field) => field.close()); runBuilder(); });
  stop.addEventListener("click", () => controller?.abort());
  panel.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); run(promptInput.value); });
  promptInput.addEventListener("input", dirty);
  save.addEventListener("click", () => {
    if (!current || current.revision !== revision) return;
    const name = (nameInput.value.trim() || current.label).slice(0, 100);
    const existing = saved.find((item) => item.name === name);
    if (!existing && saved.length >= 100) {
      status.dataset.error = "true"; status.textContent = "You have 100 saved filters. Delete one before saving another.";
      return;
    }
    if (existing) Object.assign(existing, { spec: clone(current.spec), label: current.label });
    else saved.push({ name, spec: clone(current.spec), label: current.label });
    const persisted = persist();
    renderSaved(); save.disabled = persisted;
    status.dataset.error = String(!persisted);
    status.textContent = persisted ? `“${name}” saved on this device.` : "Spotify could not save this filter. Check available storage and try again.";
  });
  function destroy() {
    destroyed = true; controller?.abort(); autocompletes.forEach((field) => field.close());
    panel.remove(); toggle.remove(); style.remove();
  }
  return { panel, toggle, page, run, runBuilder, destroy, setOpen, persist, tags: [...tags], cache, featureCache, saved, draft };
}

module.exports = { mountPanel };
