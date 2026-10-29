// Regression for overlap with Spotify's own genre-tag request. No injection.
async (page) => {
  const before = await page.evaluate(() => ({ path: Spicetify.Platform.History.location.pathname,
    uri: Spicetify.Platform.PlayerAPI.getState().item?.uri, paused: Spicetify.Platform.PlayerAPI.getState().isPaused }));
  const warnings = [], mountTimes = [];
  const listener = (message) => { if (message.text().startsWith("Liked Song Filters")) warnings.push(message.text()); };
  page.on("console", listener);
  let calls;
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.LikedSongFilters?.state, null, { timeout: 30000 });
    if (await page.evaluate(() => LikedSongFilters.version) !== "0.1.1") throw new Error("Expected installed version 0.1.1");
    await page.evaluate(() => {
      const api = Spicetify.Platform.LibraryAPI;
      const probe = { original: api.getTracksFilterTags, calls: [] };
      window.__likedFilterLifecycleProbe = probe;
      api.getTracksFilterTags = async function (...args) {
        const call = {}; probe.calls.push(call);
        try { const tags = await probe.original.apply(this, args); call.ok = true; return tags; }
        catch (error) { call.duplicate = String(error.message).includes("DUPLICATE_REQUEST_ERROR"); throw error; }
      };
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(() => Spicetify.Platform.History.push("/marketplace"));
      await page.waitForFunction(() => !document.querySelector("#rlp-add-tag"));
      const start = Date.now();
      await page.evaluate(() => Spicetify.Platform.History.push("/collection/tracks"));
      await page.waitForFunction(() => !!document.querySelector("#rlp-add-tag"), null, { timeout: 5000 });
      mountTimes.push(Date.now() - start);
      if (await page.locator("#rlp-add-tag").count() !== 1) throw new Error("Duplicate Add Tag controls");
    }
    calls = await page.evaluate(() => window.__likedFilterLifecycleProbe.calls);
    if (!calls.some((call) => call.duplicate)) throw new Error("The live regression did not exercise a native request overlap");
    if (warnings.length) throw new Error(warnings.join("\n"));
  } finally {
    await page.evaluate((path) => {
      const probe = window.__likedFilterLifecycleProbe;
      if (probe) Spicetify.Platform.LibraryAPI.getTracksFilterTags = probe.original;
      delete window.__likedFilterLifecycleProbe;
      Spicetify.Platform.History.push(path);
    }, before.path);
    page.off("console", listener);
  }
  const after = await page.evaluate(() => ({ uri: Spicetify.Platform.PlayerAPI.getState().item?.uri,
    paused: Spicetify.Platform.PlayerAPI.getState().isPaused }));
  if (before.uri !== after.uri || before.paused !== after.paused) throw new Error("Playback changed");
  return { version: "0.1.1", nativeOverlaps: calls.filter((call) => call.duplicate).length,
    successfulRequests: calls.filter((call) => call.ok).length, mountTimes, warnings, playbackPreserved: true };
}
