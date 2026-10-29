# Liked Song Filters

Save custom genre, mood, and audio-feature filters for your Spotify Liked Songs.
Open **Liked Songs → Add Tag**, beside the download button.

![The filter builder](preview.png)

Type into **Include tags** or **Exclude tags**, choose an autocomplete suggestion,
and press Enter. Remove a tag with its ×. Match all included tags or any of them;
excluded tags always remove matching songs. Suggestions come from your account's
current Spotify tag list and can change as your library changes.

Enable sliders for energy, mood (Spotify's valence), danceability, tempo,
acousticness, instrumentalness, speechiness, liveness, or loudness. Multiple
enabled ranges must all match. Percentages use 0–100%; tempo is BPM and loudness
is dB. Missing audio data is excluded and counted.

Click **Preview matches**, name the filter, then **Keep as pill**. Click a saved
pill to run its rules again. Its × deletes the saved filter. Pills and the draft
are saved on this device across reloads/restarts, scoped to the Spotify username
when available. A maximum of 100 saved pills is supported. Closing the builder
keeps your work. Navigation away and back remounts the control automatically.

**Write a filter instead** accepts simple tag expressions such as
`chill electronic with energy below 0.4` or `jazz or funk`. This is an explicit
rule parser; it does not interpret arbitrary natural-language prompts.

This version shows a separate results preview (complete count, first 20 songs).
It does not replace Spotify's native tracklist or change playback, your likes,
or playlists. Private Spotify APIs supply tags and audio features; compatibility
and availability depend on Spotify. Up to 20,000 candidate tracks are supported.
Native library membership is refreshed on each run. Audio-feature data is cached
in memory until Spotify reloads. Stop cancels after the current request.

Only filter rules are written to local storage. The extension sends requests to
Spotify through the signed-in client's API; it has no external server, analytics,
API key, or additional sign-in. Clearing Spotify's local application storage can
remove your saved filters. Third-party tools that back up Marketplace entries
may not include this extension's local rules.

## Install

Find **Liked Song Filters** in Marketplace's Extensions tab once this repository
is indexed. For a manual installation, download
[`dist/liked-song-filters.js`](https://raw.githubusercontent.com/goopii/spicetify-rice/main/extensions/liked-song-filters/dist/liked-song-filters.js)
into Spicetify's `Extensions` directory and
enable it using the [extension workflow](https://spicetify.app/docs/development/extensions):

```sh
spicetify config extensions liked-song-filters.js
spicetify apply
```

Restart Spotify. To disable:

```sh
spicetify config extensions liked-song-filters.js-
spicetify apply
```

## Development and publication

```sh
npm test
npm run build
node --check dist/liked-song-filters.js
```

No package installation is required. `src/` holds the query engine, storage,
page UI, and lifecycle. `build.cjs` produces a single standalone extension.
`tests/` covers filtering, paging, cancellation, persistence, and navigation.
Version: 0.1.1; tested with Spotify 1.3.4.258 and Spicetify 2.46.4.

Version 0.1.1 quietly retries overlapping native genre-tag requests during page
loading. Requests from a closed page or an unloaded copy cannot show late error
notifications. Genuine failures identify initialization, genre tags, reading,
or saving instead of showing a combined load/save message.

The root [Marketplace manifest](../../manifest.json) publishes this extension
from [spicetify-rice](https://github.com/goopii/spicetify-rice). See
[PUBLISHING.md](../../PUBLISHING.md) for discovery and update instructions.

Licensed under [MIT](../../LICENSE).
