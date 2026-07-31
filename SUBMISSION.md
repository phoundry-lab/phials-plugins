# Submitting a plugin to the registry

This checklist is what maintainers verify before merging a pull request that adds or updates an entry in [`community-plugins.json`](community-plugins.json).

## 1. Plugin id and ownership

- **Id format:** `vendor.plugin-name` (lowercase), matching Phials validation: `^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*[a-z0-9]$`.
- **Reserved namespace:** Ids must **not** start with `phials.` (reserved for built-in / first-party app plugins).
- **Uniqueness:** The id must not already appear in `community-plugins.json`.
- **Ownership:** The GitHub user or organization publishing the plugin repo should match the `vendor` segment, or you must document a clear transfer path (see [POLICY.md](POLICY.md)).

## 2. Index entry fields

Each entry must contain only the reviewed identity fields plus the machine-verified release record:

| Field | Requirement |
|--------|----------------|
| `id` | Same string as `id` in the plugin’s `manifest.json`. |
| `name` | Short display title. |
| `author` | Maintainer or team name. |
| `description` | One or two sentences for the in-app browser. |
| `repo` | `owner/repo` only (no `https://`, no leading slash). Must match the repo used for **GitHub Releases**. |
| `listed` | Optional. Set to `false` only for temporary machine-supported unlisting; omit to restore after a verified release exists. |
| `release` | Required while listed. Exact stable tag/version, candidate SHA-256, and the complete canonical asset name/size/SHA-256 inventory produced by the starter. Omit while unlisted. |

## 3. GitHub release and artifacts

- **Releases:** Distribution uses the latest stable **GitHub Release**. Raw repository files are not an install fallback.
- **Required files:** Each release must provide **`manifest.json`** and **`main.js`**. Optional **`styles.css`** if your plugin ships styles.
- Attach exactly the names recorded by `npm run release:inventory`; unresolved chunks and unrecorded files are rejected.
- **Tag format:** Version tags are normalized (with or without leading `v`); ensure `manifest.json` **`version`** matches the release you intend users to install.

## 4. Manifest compatibility

- **`minAppVersion`** and **`pluginApiVersion`** must be satisfied by current Phials builds you target (see the canonical [version and compatibility reference](https://github.com/phoundry/phials/blob/main/documentation/developer/reference/plugin-contract-and-compatibility/version-and-compatibility-reference.md), or the synchronized SDK in [phials-plugin-example](https://github.com/phoundry/phials-plugin-example)).
- **Permissions:** Request only what you need. **`shell.execute`** is not supported in v1. Allowed permissions are documented in Phials developer docs under community plugins.

## 5. Review (v1 trust model)

- Maintainers review the **repository**, **latest release assets**, and **declared permissions** before merge.
- Listings imply **GitHub release trust** plus this review—not a cryptographic guarantee.

## 6. Pull request

1. Fork this repository (or open a branch if you are a maintainer).
2. Add or update your entry in `community-plugins.json`.
3. Run locally: `npm run validate && npm run test:run && npm run validate:remote`.
4. Open a PR with a link to your plugin repo and release tag you want listed.

If the registry index is invalid, Phials will refuse to load the community list until it is fixed—run validation before pushing.

Maintainers temporarily unlist and restore reviewed records with:

```bash
npm run registry:unlist -- vendor.plugin-name
npm run registry:restore -- vendor.plugin-name \
  --inventory /absolute/path/to/release/release-inventory.json \
  --tag v1.2.3
```
