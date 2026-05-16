# Phials community plugins registry

Canonical **`community-plugins.json`** for [Phials](https://github.com/phoundry/phials) lives on the default branch of this repo. The app fetches:

`https://raw.githubusercontent.com/EliWimmer/phials-plugins/master/community-plugins.json`

**Maintainers:** Phoundry coordinates the index; this repository is the source of truth for which community plugins appear in the in-app browser.

## For users

1. Open Phials  
2. **Settings → Plugins → Community plugins**  
3. Turn **safe mode** off and accept the warning (safe mode is on by default)  
4. Browse the list and **Install** a plugin  

Community plugins are **trusted JavaScript** running in the app with **permission-gated** Phials APIs—not a full sandbox. See Phials [user plugins documentation](https://github.com/phoundry/phials/blob/main/documentation/user/plugins.md).

## For plugin authors

Authoring starts from the public example repo: **[phoundry/phials-plugin-example](https://github.com/phoundry/phials-plugin-example)** (Svelte 5, Vite, synced SDK types, `npm run validate` on `dist/`).

### Artifact layout

Each **GitHub Release** should ship:

| File | Required |
|------|----------|
| `manifest.json` | Yes |
| `main.js` | Yes |
| `styles.css` | Optional |

Prefer attaching these as **release assets** with exact filenames. The loader can fall back to raw files at the release tag when assets are missing.

### manifest.json (summary)

Required: `id`, `name`, `version`, `minAppVersion`, `author`, `description`.  
Optional: `pluginApiVersion`, `authorUrl`, `repository`, `icons`, `permissions`.

**Plugin id:** `vendor.plugin-name` (lowercase). Do **not** use the reserved `phials.*` prefix for community plugins.

**Permissions (v1):** `filesystem.read`, `filesystem.write`, `clipboard.read`, `clipboard.write`, `network.fetch`. There is no `shell.execute` permission in v1.

Full rules and compatibility semantics: [Public API contract](https://github.com/phoundry/phials/blob/main/documentation/developer/plugins/public-api-contract.md) · [Community plugins](https://github.com/phoundry/phials/blob/main/documentation/developer/plugins/external-plugins.md) · [Getting started](https://github.com/phoundry/phials/blob/main/documentation/developer/plugins/getting-started.md).

### Listing your plugin here

See **[SUBMISSION.md](SUBMISSION.md)** for the maintainer checklist. Governance and takedowns: **[POLICY.md](POLICY.md)**.

Validate before opening a PR:

```bash
npm run validate
```

### JSON Schema

[`community-plugins.schema.json`](community-plugins.schema.json) describes the index shape (optional `$schema` in `community-plugins.json` points at this file for editors).

## License

MIT
