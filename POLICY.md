# Registry policy: takedown, broken releases, and ownership

The community registry is a **static JSON index** on GitHub. There is no separate revocation API in v1; changes happen through git history and Phials fetching the current file from the default branch.

## Malicious or abusive plugins

- **Report:** Open a private security report to registry maintainers or Phials maintainers with evidence (repo, release, behavior).
- **Action:** Run `npm run registry:unlist -- <plugin-id>` as soon as abuse is confirmed. This preserves the reviewed identity with `listed: false` and removes the release record. Optionally open a public advisory in the plugin repo.
- **Users:** Removing an entry stops **new installs** from the in-app browser for that id. Already-installed copies remain on disk until the user uninstalls. Users should disable community plugins or re-enable **safe mode** if they are unsure (see Phials user documentation).

## Broken or incompatible releases

- If the **latest** GitHub Release is broken (missing files, bad manifest, wrong semver), fix the release or publish a newer good release. Phials resolves **latest** by GitHub’s API.
- If the plugin cannot be fixed quickly, maintainers set `listed: false` and remove its `release` record. Phials omits that entry from new-install discovery. Restoration removes `listed` (or sets it to `true`) and adds a newly verified immutable release record.

## Ownership transfer

- **Voluntary:** Old owner confirms transfer; new owner opens a PR updating `repo` and/or `id` as needed.
- **Id changes** require a new manifest `id` and a coordinated registry update (treat as a new plugin from the app’s perspective unless you document migration for users).

## Deprecation and unlisting

- **Deprecation/replacement:** The registry does not carry deprecation or replacement metadata until Phials has a consuming product surface. Communicate it in the plugin repository and release notes.
- **Unlisting:** Set `listed: false` and omit `release`. This stops new installs and update discovery only; it does not remotely disable, remove, or alter already-installed copies. Restore the same reviewed record after a valid release is available.
- **Commands:** Use `npm run registry:unlist -- <plugin-id>` and restore from a newly verified starter inventory with `npm run registry:restore -- <plugin-id> --inventory <path> --tag <tag>`.

## Scope

This policy covers **this registry repository** only. Phials app behavior (safe mode, permissions, install paths) is documented in the main Phials and phials-plugin-example documentation.
