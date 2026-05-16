# Submitting a plugin to the registry

This checklist is what maintainers verify before merging a pull request that adds or updates an entry in [`community-plugins.json`](community-plugins.json).

## 1. Plugin id and ownership

- **Id format:** `vendor.plugin-name` (lowercase), matching Phials validation: `^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*[a-z0-9]$`.
- **Reserved namespace:** Ids must **not** start with `phials.` (reserved for built-in / first-party app plugins).
- **Uniqueness:** The id must not already appear in `community-plugins.json`.
- **Ownership:** The GitHub user or organization publishing the plugin repo should match the `vendor` segment, or you must document a clear transfer path (see [POLICY.md](POLICY.md)).

## 2. Index entry fields

Each entry must contain **only** these keys (extras are rejected by the app and CI):

| Field | Requirement |
|--------|----------------|
| `id` | Same string as `id` in the plugin’s `manifest.json`. |
| `name` | Short display title. |
| `author` | Maintainer or team name. |
| `description` | One or two sentences for the in-app browser. |
| `repo` | `owner/repo` only (no `https://`, no leading slash). Must match the repo used for **GitHub Releases**. |

## 3. GitHub release and artifacts

- **Releases:** Distribution uses **GitHub Releases** (latest release) plus optional raw fallback at the release tag.
- **Required files:** Each release must provide **`manifest.json`** and **`main.js`**. Optional **`styles.css`** if your plugin ships styles.
- **Prefer release assets** named exactly `manifest.json`, `main.js`, and `styles.css` so installs are reliable.
- **Tag format:** Version tags are normalized (with or without leading `v`); ensure `manifest.json` **`version`** matches the release you intend users to install.

## 4. Manifest compatibility

- **`minAppVersion`** and optional **`pluginApiVersion`** must be satisfied by current Phials builds you target (see [public API contract](https://github.com/phoundry/phials/blob/main/documentation/developer/plugins/public-api-contract.md) in the Phials repo, or synced SDK in [phials-plugin-example](https://github.com/phoundry/phials-plugin-example)).
- **Permissions:** Request only what you need. **`shell.execute`** is not supported in v1. Allowed permissions are documented in Phials developer docs under community plugins.

## 5. Review (v1 trust model)

- Maintainers review the **repository**, **latest release assets**, and **declared permissions** before merge.
- Listings imply **GitHub release trust** plus this review—not a cryptographic guarantee.

## 6. Pull request

1. Fork this repository (or open a branch if you are a maintainer).
2. Add or update your entry in `community-plugins.json`.
3. Run locally: `npm run validate`.
4. Open a PR with a link to your plugin repo and release tag you want listed.

If the registry index is invalid, Phials will refuse to load the community list until it is fixed—run validation before pushing.
