// Run with the retained Spotify Playwright CLI session. No script injection.
async (page) => {
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const before = await page.evaluate(() => ({
    path: Spicetify.Platform.History.location.pathname,
    uri: Spicetify.Platform.PlayerAPI.getState().item?.uri,
    paused: Spicetify.Platform.PlayerAPI.getState().isPaused,
    state: JSON.parse(JSON.stringify(LikedSongFilters.state)),
  }));
  const name = "Persistence check " + Date.now();
  const panel = page.locator("#liked-song-filters");
  async function visit() {
    await page.evaluate(() => Spicetify.Platform.History.push("/collection/tracks"));
    await page.waitForFunction(() => !!document.querySelector("#rlp-add-tag"), null, { timeout: 45000 });
  }
  async function open() {
    if (!(await panel.isVisible())) await page.locator("#rlp-add-tag").click();
  }
  async function idle() {
    await page.waitForFunction(() => document.querySelector("#liked-song-filters")?.getAttribute("aria-busy") === "false",
      null, { timeout: 60000 });
    if (await panel.locator('.rlp-status[data-error="true"]').count()) throw new Error(await panel.locator(".rlp-status").textContent());
  }
  let count;
  try {
    check(await page.evaluate(() => LikedSongFilters.version === "0.1.1"), "Installed bundle loads automatically without script injection");
    await visit();
    check(await page.locator("#rlp-add-tag").count() === 1, "One Add Tag button mounts on Liked Songs");
    await open();
    await panel.getByRole("button", { name: "Clear filters", exact: true }).click();
    const include = panel.getByRole("combobox", { name: "Include tags", exact: true });
    const exclude = panel.getByRole("combobox", { name: "Exclude tags", exact: true });
    for (const tag of ["Chill", "Electronic"]) { await include.fill(tag); await include.press("Enter"); }
    await exclude.fill("Fast"); await exclude.press("Enter");
    check(await panel.getByRole("button", { name: "Remove Fast from excluded tags", exact: true }).count() === 1,
      "Autocomplete and Enter create include/exclude chips");
    await panel.getByRole("checkbox", { name: "Enable energy filter" }).check();
    await panel.getByRole("slider", { name: "Maximum energy", exact: true }).evaluate((input) => {
      input.value = "0.4"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await panel.getByRole("button", { name: "Preview matches", exact: true }).click();
    await idle();
    const match = await page.evaluate(() => {
      const { draft, tags, cache, featureCache } = LikedSongFilters.mounted;
      const has = (name, uri) => {
        const tag = tags.find((item) => item.name === name);
        return cache.get(JSON.stringify([tag.filter])).items.some((track) => track.uri === uri);
      };
      const count = cache.get("[]").items.filter((track) => draft.include.every((tag) => has(tag, track.uri))
        && !draft.exclude.some((tag) => has(tag, track.uri))
        && featureCache.get(track.uri)?.energy >= 0 && featureCache.get(track.uri)?.energy <= 0.4).length;
      return { expected: count, actual: Number(document.querySelector("#liked-song-filters").dataset.count) };
    });
    count = match.actual;
    check(match.actual === match.expected && count > 0, "Real native tags, exclusions, and energy filtering agree with an independent count");
    await panel.getByRole("textbox", { name: "Custom pill name" }).fill(name);
    await panel.getByRole("button", { name: "Keep as pill", exact: true }).click();
    check(await page.evaluate((name) => LikedSongFilters.state.saved.some((item) => item.name === name), name), "A named pill is saved");
    await panel.getByRole("button", { name: "Close tag builder", exact: true }).click();
    check(!(await panel.isVisible()), "The builder closes without discarding rules");
    await page.evaluate(() => Spicetify.Platform.History.push("/search"));
    await page.waitForFunction(() => !document.querySelector("#rlp-add-tag"));
    await visit(); await open();
    check(await page.locator("#rlp-add-tag").count() === 1
      && await panel.getByRole("slider", { name: "Maximum energy", exact: true }).inputValue() === "0.4",
    "Navigation remounts one builder and preserves the draft");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.LikedSongFilters?.state, null, { timeout: 45000 });
    await visit(); await open();
    check(await panel.getByRole("button", { name, exact: true }).count() === 1
      && await panel.getByRole("button", { name: "Remove Fast from excluded tags", exact: true }).count() === 1
      && await panel.getByRole("slider", { name: "Maximum energy", exact: true }).inputValue() === "0.4",
    "A real page reload restores the named pill, exclusions, and slider draft without reinjection");
    await panel.getByRole("button", { name, exact: true }).click(); await idle();
    check(Number(await panel.getAttribute("data-count")) === count, "The persisted pill runs again with the same results");
    await panel.getByRole("button", { name: `Delete saved filter ${name}`, exact: true }).click();
    check(await page.evaluate((name) => !LikedSongFilters.state.saved.some((item) => item.name === name), name), "The saved pill's X deletes its persistent rule");

    // A shareable Marketplace preview contains only the controls, with no song
    // results, usernames, existing named filters, or other desktop content.
    await panel.locator(".rlp-results").evaluate((element) => { element.hidden = true; });
    await panel.locator(".rlp-pills").evaluate((element) => { element.hidden = true; });
    await panel.locator(".rlp-status").evaluate((element) => {
      element.textContent = "Save your own genre, mood, and audio-feature filters.";
    });
    await panel.getByRole("textbox", { name: "Custom pill name" }).fill("Gentle electronic");
    // Spotify can have a non-default Chromium page zoom; scale the capture
    // coordinates so the preview contains the builder rather than the sidebar.
    await panel.scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const zoom = metrics.cssVisualViewport.zoom || 1;
    const box = await panel.boundingBox();
    await page.screenshot({ path: ".playwright-cli/liked-song-filters-preview.png",
      clip: { x: box.x * zoom, y: box.y * zoom, width: box.width * zoom, height: box.height * zoom } });
  } finally {
    await page.evaluate((original) => {
      if (!window.LikedSongFilters?.state) return;
      Object.assign(LikedSongFilters.state.draft, original.state.draft);
      LikedSongFilters.state.saved.splice(0, LikedSongFilters.state.saved.length, ...original.state.saved);
      LikedSongFilters.mounted?.persist?.();
      Spicetify.Platform.History.push(original.path);
    }, before);
  }
  const after = await page.evaluate(() => ({ uri: Spicetify.Platform.PlayerAPI.getState().item?.uri,
    paused: Spicetify.Platform.PlayerAPI.getState().isPaused, path: Spicetify.Platform.History.location.pathname }));
  check(before.uri === after.uri && before.paused === after.paused && before.path === after.path,
    "Playback and original page are preserved; temporary filters are removed");
  return { passed: checks.length, count, checks };
}
