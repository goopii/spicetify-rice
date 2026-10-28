# Change log

Completed repository changes. Newest first.

## 2026-10-28 — Add Liked Song Filters for Marketplace discovery

Added Liked Song Filters 0.1.0 under `extensions/` with its standalone bundle, source, tests, README, and control-only preview. Added MIT licensing and a root array manifest whose paths support a multi-extension repository. Added repository build/test commands and a validator for required manifest fields, file paths, JavaScript syntax, and PNG previews. Made `goopii/spicetify-rice` public and enabled the `spicetify-extensions` topic required by Marketplace discovery. The existing Rice extension path and installed bundle resolve to this canonical checkout; its executable bundle is unchanged. Marketplace search indexing may lag behind publication.

- **Files:** `.gitignore`, `LICENSE`, `README.md`, `PUBLISHING.md`, `manifest.json`, `package.json`, `scripts/validate-marketplace.cjs`, `extensions/liked-song-filters/`.
- **Verification:** `npm run build` — generated version 0.1.0. `npm test` — 19 extension tests passed and one Marketplace entry validated. `git diff --check` and package whitespace/host-path assertions — passed. SHA-256 of bundle: `a48d15f3997c10f7894737a8223101448d999c45428a28bec51e3a3a6e4f8d20`, matching the existing local installation. From the Rice installation, `python managed.py maintain --offline` and `python managed.py status` — healthy/current, no errors; compatibility and installed link assertions passed. `gh repo view goopii/spicetify-rice --json isPrivate,repositoryTopics,defaultBranchRef,url` — public, `main` branch, discovery topic enabled. Runtime smoke tests were not repeated because executable bytes did not change; the packaged version previously passed 11 live startup, matching, persistence, navigation, and playback-preservation checks.
