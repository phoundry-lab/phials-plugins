# Registry policy: takedown, broken releases, and ownership

The community registry is a **static JSON index** on GitHub. There is no separate revocation API in v1; changes happen through git history and Phials fetching the current file from the default branch.

## Malicious or abusive plugins

- **Report:** Open a private security report to registry maintainers or Phials maintainers with evidence (repo, release, behavior).
- **Action:** Remove the entry from `community-plugins.json` as soon as abuse is confirmed. Optionally open a public advisory in the plugin repo.
- **Users:** Removing an entry stops **new installs** from the in-app browser for that id. Already-installed copies remain on disk until the user uninstalls. Users should disable community plugins or re-enable **safe mode** if they are unsure (see Phials user documentation).

## Broken or incompatible releases

- If the **latest** GitHub Release is broken (missing files, bad manifest, wrong semver), fix the release or publish a newer good release. Phials resolves **latest** by GitHub’s API.
- If the plugin cannot be fixed quickly, maintainers may **remove** the index entry temporarily and restore it when a good release exists.

## Ownership transfer

- **Voluntary:** Old owner confirms transfer; new owner opens a PR updating `repo` and/or `id` as needed.
- **Id changes** require a new manifest `id` and a coordinated registry update (treat as a new plugin from the app’s perspective unless you document migration for users).

## Deprecation and unlisting

- **Deprecation:** Prefer shipping a final release and updating the description field to “deprecated — use X”. Remove from the index when appropriate.
- **Unlisting:** Delete the entry from `community-plugins.json`. Optionally archive the plugin repository.

## Scope

This policy covers **this registry repository** only. Phials app behavior (safe mode, permissions, install paths) is documented in the main Phials and phials-plugin-example documentation.
