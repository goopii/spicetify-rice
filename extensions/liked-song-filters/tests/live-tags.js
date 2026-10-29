// Verify discovery beyond Spotify's suggested pills, preserving the user's draft.
async (page) => {
  const before = await page.evaluate(async () => {
    const user = await Spicetify.Platform.UserAPI.getUser();
    const stored = LikedSongFilters.state ?? JSON.parse(localStorage.getItem("liked-song-filters:v1:" + user.username));
    return {
    draft: JSON.parse(JSON.stringify(stored.draft)),
    saved: JSON.parse(JSON.stringify(stored.saved)),
    knownTags: stored.knownTags ?? [],
    open: LikedSongFilters.mounted && !LikedSongFilters.mounted.panel.hidden,
    inputs: [...(LikedSongFilters.mounted?.panel.querySelectorAll("input") ?? [])]
      .filter((input) => !["range", "checkbox"].includes(input.type)).map((input) => ({ id: input.id, value: input.value })),
    active: document.activeElement?.id,
    uri: Spicetify.Platform.PlayerAPI.getState().item?.uri,
    paused: Spicetify.Platform.PlayerAPI.getState().isPaused,
  }; });
  await page.evaluate((snapshot) => {
    if (sessionStorage.getItem("liked-song-filters:live-test-backup")) throw new Error("Restore the interrupted test backup before running again.");
    sessionStorage.setItem("liked-song-filters:live-test-backup", JSON.stringify(snapshot));
  }, before);
  const checks = [], panel = page.locator("#liked-song-filters");
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  async function open() {
    await page.waitForFunction(() => !!window.LikedSongFilters?.state && !!window.Spicetify?.Platform?.History,
      null, { timeout: 15000, polling: 100 });
    await page.evaluate(() => {
      if (Spicetify.Platform.History.location.pathname !== "/collection/tracks") Spicetify.Platform.History.push("/collection/tracks");
    });
    await page.waitForFunction(() => !!document.querySelector("#rlp-add-tag"), null, { timeout: 15000, polling: 100 });
    await page.evaluate(() => LikedSongFilters.mounted.setOpen(true));
  }
  // Chromium embedded in Spotify can stop animation frames when unfocused.
  // Drive the actual DOM event handlers without waiting for pointer stability.
  const click = (locator) => locator.evaluate((element) => element.click());
  const fill = (locator, value) => locator.evaluate((input, value) => {
    input.value = value; input.focus(); input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const enter = (locator) => locator.evaluate((input) => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  let count, totalSuggestions;
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LikedSongFilters?.version === "0.1.2" && !!LikedSongFilters.state,
      null, { timeout: 15000, polling: 100 });
    check(await page.evaluate((original) => JSON.stringify(LikedSongFilters.state.draft) === JSON.stringify(original.draft)
      && JSON.stringify(LikedSongFilters.state.saved) === JSON.stringify(original.saved), before),
    "Updating preserves the user's existing draft and saved pills");
    await open();
    await page.evaluate(() => {
      // Exercise a fresh lookup even if a previous session already learned R&B.
      LikedSongFilters.state.knownTags = LikedSongFilters.state.knownTags.filter((name) => name !== "R&B");
      const tags = LikedSongFilters.mounted.tags;
      const index = tags.findIndex((tag) => tag.name === "R&B");
      if (index >= 0) tags.splice(index, 1);
    });
    await click(panel.getByRole("button", { name: "Clear filters", exact: true }));
    const include = panel.getByRole("combobox", { name: "Include tags", exact: true });
    await fill(include, "");
    totalSuggestions = await panel.getByRole("listbox", { name: "Include tag suggestions" }).getByRole("option").count();
    check(totalSuggestions > 8, "Autocomplete shows all suggestions instead of truncating at eight");
    await fill(include, "RnB");
    await page.waitForFunction(() => [...document.querySelectorAll('#rlp-include-options [role="option"]')]
      .some((option) => option.textContent === "R&B"), null, { timeout: 10000, polling: 100 });
    check(true, "Typing RnB discovers the supported R&B tag through a live Spotify check");
    await enter(include);
    check(await panel.getByRole("button", { name: "Remove R&B from included tags", exact: true }).count() === 1,
      "Enter adds the canonical R&B chip");
    const expected = await page.evaluate(async () => (await Spicetify.Platform.PlaylistAPI.getContents(
      Spicetify.Platform.LibraryAPI._likedSongsUri, { offset: 0, limit: 1, descriptorFilter: ["r&b"] })).totalLength);
    await click(panel.getByRole("button", { name: "Preview matches", exact: true }));
    await page.waitForFunction(() => document.querySelector("#liked-song-filters")?.getAttribute("aria-busy") === "false",
      null, { timeout: 45000, polling: 100 });
    count = Number(await panel.getAttribute("data-count"));
    check(count === expected && count > 0, "The R&B preview count agrees with Spotify's complete native result count");
    await click(panel.getByRole("button", { name: "Remove R&B from included tags", exact: true }));
    const exclude = panel.getByRole("combobox", { name: "Exclude tags", exact: true });
    await fill(exclude, "rnb"); await enter(exclude);
    check(await panel.getByRole("button", { name: "Remove R&B from excluded tags", exact: true }).count() === 1,
      "The same RnB alias also works in the exclude field");
    await page.reload({ waitUntil: "domcontentloaded" });
    await open();
    check(await panel.getByRole("button", { name: "Remove R&B from excluded tags", exact: true }).count() === 1,
      "A discovered tag remains usable across a real reload even when Spotify does not suggest it");
  } finally {
    await page.waitForFunction(() => !!window.Spicetify?.Platform?.UserAPI?.getUser,
      null, { timeout: 30000, polling: 100 });
    await page.evaluate(async (original) => {
      const user = await Spicetify.Platform.UserAPI.getUser();
      const key = "liked-song-filters:v1:" + user.username;
      const state = JSON.parse(localStorage.getItem(key));
      state.draft = original.draft; state.saved = original.saved;
      state.knownTags = [...new Set([...original.knownTags, "R&B"])];
      localStorage.setItem(key, JSON.stringify(state));
    }, before);
    await open();
    await page.evaluate((original) => {
      Object.assign(LikedSongFilters.state.draft, original.draft);
      LikedSongFilters.state.saved.splice(0, LikedSongFilters.state.saved.length, ...original.saved);
      LikedSongFilters.state.knownTags = [...new Set([...original.knownTags, "R&B"])];
      LikedSongFilters.mounted?.persist();
      LikedSongFilters.mounted?.destroy();
    }, before);
    await page.waitForFunction(() => !!LikedSongFilters.mounted?.panel.isConnected, null, { timeout: 15000, polling: 100 });
    await page.evaluate((original) => {
      const mounted = LikedSongFilters.mounted;
      if (original.open) mounted.setOpen(true);
      original.inputs.forEach(({ id, value }) => { const input = document.getElementById(id); if (input) input.value = value; });
      if (original.active) document.getElementById(original.active)?.focus({ preventScroll: true });
    }, before);
  }
  check(await page.evaluate((original) => {
    const player = Spicetify.Platform.PlayerAPI.getState();
    return JSON.stringify(LikedSongFilters.state.draft) === JSON.stringify(original.draft)
      && JSON.stringify(LikedSongFilters.state.saved) === JSON.stringify(original.saved)
      && player.item?.uri === original.uri && player.isPaused === original.paused;
  }, before), "Original draft, saved pills, and playback are restored; R&B remains available in the catalog");
  await page.evaluate(() => sessionStorage.removeItem("liked-song-filters:live-test-backup"));
  return { passed: checks.length, totalSuggestions, count, checks };
}
