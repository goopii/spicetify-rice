function createExtension(host, { core, createStore, mountPanel, version }) {
  host.LikedSongFilters?.destroy();
  host.LikedSongsPillPrototype?.destroy();
  let stopped = false, timer, observer, unlisten, platform, store, state, mounted;
  let loading = false, tags, retryAt = 0, warned = false;
  const cache = new Map(), featureCache = new Map();
  function notify(error) {
    if (warned) return;
    warned = true;
    host.console.warn("Liked Song Filters:", error.message);
    host.Spicetify?.showNotification?.("Liked Song Filters could not load or save. Check Spotify's developer console.", true);
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
        unlisten = platform.History.listen(() => { tags = null; unmount(); schedule(); });
        observer = new host.MutationObserver(() => schedule());
        observer.observe(host.document.body, { childList: true, subtree: true });
      } catch (error) { notify(error); schedule(5000); return; }
      finally { loading = false; }
    }
    if (platform.History.location.pathname !== "/collection/tracks") { unmount(); return; }
    const page = host.document.querySelector('.Root__main-view [data-testid="playlist-page"]');
    if (mounted && mounted.page === page && mounted.panel.isConnected && mounted.toggle.isConnected) return;
    unmount();
    if (!page) return;
    if (host.Date.now() < retryAt) { schedule(retryAt - host.Date.now()); return; }
    loading = true;
    try {
      if (!tags) {
        const response = await platform.LibraryAPI.getTracksFilterTags();
        if (!Array.isArray(response)) throw new Error("Spotify returned an invalid tag list");
        tags = response.filter((tag) => typeof tag?.name === "string" && typeof tag.filter === "string"
          && tag.filter.startsWith("tags contains ")).map((tag) => ({ name: tag.name, filter: tag.filter }));
      }
      if (stopped || platform.History.location.pathname !== "/collection/tracks") return;
      mounted = mountPanel({ core, platform, tags, state, cache, featureCache, persist: () => store.save(state) });
    } catch (error) { notify(error); retryAt = host.Date.now() + 30000; schedule(30000); }
    finally { loading = false; }
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
