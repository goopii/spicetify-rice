function createExtension(host, { core, createStore, mountPanel, version }) {
  host.LikedSongFilters?.destroy();
  host.LikedSongsPillPrototype?.destroy();
  let stopped = false, timer, observer, unlisten, platform, store, state, mounted;
  let loading = false, tags, retryAt = 0, tagRetries = 0, routeEpoch = 0;
  const warned = new Set();
  const cache = new Map(), featureCache = new Map();
  function notify(error, operation = "initialize") {
    if (stopped || warned.has(operation)) return;
    warned.add(operation);
    const messages = {
      initialize: "Liked Song Filters could not initialize. Try reopening Spotify.",
      tags: "Liked Song Filters could not load Spotify's genre tags. Reopen Liked Songs to retry.",
      load: "Liked Song Filters could not read saved filters. Check Spotify's developer console.",
      save: "Liked Song Filters could not save filters on this device. Check available storage.",
    };
    host.console.warn(`Liked Song Filters (${operation}):`, error.message);
    host.Spicetify?.showNotification?.(messages[operation], true);
  }
  function schedule(delay = 100) {
    if (stopped || timer) return;
    timer = host.setTimeout(() => { timer = null; reconcile(); }, delay);
  }
  function unmount() {
    mounted?.destroy(); mounted = null; cache.clear();
  }
  async function reconcile() {
    if (stopped || loading) return;
    const api = host.Spicetify;
    if (!platform) {
      if (!api?.Platform?.History?.listen || !api.Platform.LibraryAPI?.getTracksFilterTags
        || !api.Platform.LibraryAPI._likedSongsUri || !api.Platform.PlaylistAPI?.getContents || !api.CosmosAsync?.get) {
        schedule(250); return;
      }
      loading = true;
      try {
        const ready = api.Platform;
        const user = await ready.UserAPI?.getUser?.();
        if (stopped) return;
        platform = ready;
        const key = "liked-song-filters:v1:" + (user?.username ?? platform.LibraryAPI._likedSongsUri);
        store = createStore(host.localStorage, key, core, notify);
        state = store.load();
        unlisten = platform.History.listen(() => {
          routeEpoch++; tags = null; retryAt = 0; tagRetries = 0;
          host.clearTimeout(timer); timer = null;
          unmount(); schedule();
        });
        observer = new host.MutationObserver(() => schedule());
        observer.observe(host.document.body, { childList: true, subtree: true });
      } catch (error) { notify(error, "initialize"); schedule(5000); return; }
      finally { loading = false; }
    }
    if (platform.History.location.pathname !== "/collection/tracks") { unmount(); return; }
    const page = host.document.querySelector('.Root__main-view [data-testid="playlist-page"]');
    if (mounted && mounted.page === page && mounted.panel.isConnected && mounted.toggle.isConnected) return;
    unmount();
    if (!page) return;
    if (host.Date.now() < retryAt) { schedule(retryAt - host.Date.now()); return; }
    loading = true;
    const epoch = routeEpoch;
    try {
      if (!tags) {
        const response = await platform.LibraryAPI.getTracksFilterTags();
        if (stopped || epoch !== routeEpoch) return;
        if (!Array.isArray(response)) throw new Error("Spotify returned an invalid tag list");
        tags = response.filter((tag) => typeof tag?.name === "string" && typeof tag.filter === "string"
          && tag.filter.startsWith("tags contains ")).map((tag) => ({ name: tag.name, filter: tag.filter }));
        tagRetries = 0;
      }
      if (stopped || platform.History.location.pathname !== "/collection/tracks") return;
      mounted = mountPanel({ core, platform, tags, state, cache, featureCache, persist: () => store.save(state) });
    } catch (error) {
      if (stopped || epoch !== routeEpoch) return;
      // Spotify's native page requests the same genre tags. Its request bridge
      // rejects concurrent identical requests instead of sharing the result.
      // This is a short-lived loading conflict, not a saved-filter failure.
      const duplicate = error?.code === "DUPLICATE_REQUEST_ERROR"
        || String(error?.message).includes("DUPLICATE_REQUEST_ERROR");
      const quietRetry = duplicate && tagRetries < 6;
      const delay = quietRetry ? Math.min(250 * 2 ** tagRetries++, 2000) : 30000;
      if (!quietRetry) notify(error, "tags");
      retryAt = host.Date.now() + delay;
      schedule(delay);
    } finally {
      loading = false;
      if (!stopped && epoch !== routeEpoch) schedule();
    }
  }
  const extension = {
    version,
    get mounted() { return mounted; },
    get state() { return state; },
    destroy() {
      stopped = true; host.clearTimeout(timer); observer?.disconnect(); unlisten?.(); unmount();
      if (host.LikedSongFilters === extension) delete host.LikedSongFilters;
    },
  };
  host.LikedSongFilters = extension;
  schedule(0);
  return extension;
}

module.exports = { createExtension };
