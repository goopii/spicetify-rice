# Marketplace publishing

This repository publishes extensions using the
[official Marketplace discovery requirements](https://github.com/spicetify/marketplace/wiki/Publishing-to-Marketplace):
a public repository, the `spicetify-extensions` GitHub topic, and a root
`manifest.json`. Extension entries use repository-relative paths. The array
manifest supports several extensions in this repository.

The repository uses the MIT license. Liked Song Filters supplies its generated
bundle, source, tests, README, and preview image. Discovery and cached search
results can take time to refresh; the documentation gives no indexing deadline.
Extensions do not require a pull request to the Marketplace repository.

## Update an extension

1. Edit its source under `extensions/<name>/src/` and bump the package version.
2. Run `npm run build` and `npm test` from this repository's root.
3. Review and commit the generated bundle, then push the published branch.

## Add another extension

Add its directory under `extensions/`, then append an entry to the root manifest.
Each entry needs `name`, `description`, `preview`, `main`, and `readme`. Paths
must start from the repository root, including the `extensions/<name>/` prefix.
Optional authors and tags describe the card. Extend the root build/test scripts
as new buildable packages are added. Repository-level changes do not require a
new Marketplace submission.

The extension's own local manifest documents its standalone package, but the
repository's **root** manifest is the one Marketplace discovers. Keep both in
sync if the name, description, or bundle layout changes.

The local Rice installation links to the bundle in this checkout. It remains a
manual/local installation until installed through Marketplace; a discoverable
repository alone does not add an Installed card to existing Spotify profiles.
