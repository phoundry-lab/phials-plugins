# Standalone community themes

[`community-themes.json`](community-themes.json) is the standalone theme registry for Phials, independent of [`community-plugins.json`](community-plugins.json). Its canonical URL is:

`https://raw.githubusercontent.com/EliWimmer/phials-plugins/master/community-themes.json`

Themes are declarative `theme.json` + `theme.css` packages. They have **no executable Plugin hooks, no `main.js`, no Plugin permissions, and no safe-mode gate**. Do not register a theme as an executable Plugin just to distribute it. The index starts empty; add only reviewed, actually published releases.

## 1. Prepare the two files

`theme.json` contains required `id`, `name`, and `mode`; optional `author` and `preview` are the only other allowed fields. For example (illustrative, not a published release):

```json
{
  "id": "your-name.your-theme",
  "name": "Your Theme",
  "mode": "dark",
  "author": "Your Name",
  "preview": {
    "background": "#101010",
    "foreground": "#eeeeee",
    "accent": "#80aaff"
  }
}
```

- **Id:** at least two dot-separated lowercase segments. Each segment begins with a letter, ends with a letter or digit, and may contain internal hyphens. Single-letter segments are valid. Maximum 128 characters total. `phi.`, `phials.`, and `phoundry.` namespaces are reserved. Ids must remain unique even across unlisted entries.
- **Name:** non-empty display name, identical to the index entry.
- **Mode:** exactly `light` or `dark`, identical to the index entry.
- **Author:** optional in the manifest, required in the index; if included, it must match exactly.
- **Preview:** optional object containing exactly `background`, `foreground`, and `accent` color strings. The registry checks non-empty strings; Phials validates CSS color support at its manifest boundary.

Do not add Plugin manifest fields such as `version`, `permissions`, `main`, or executable contributions. The release version belongs to the registry release record, not `theme.json`.

`theme.css` must be self-contained theme CSS using Phials/phoundry-ui theme tokens. Native installation enforces the self-contained CSS policy; this registry validator does not parse CSS and successful registry validation is not a substitute for checking native installation. Do not rely on extra assets, scripts, remote imports or external resources.

## 2. Publish an immutable release

1. Create a public GitHub repository you control. Its registry `repo` is `owner/repo`, not a URL. Owner is at most 39 characters and uses alphanumeric characters and internal hyphens. Repository names are at most 100 characters and may use `A-Z`, `a-z`, `0-9`, `_`, `.`, and `-`, but cannot be `.` or `..` or end in `.git`. No query strings, fragments, or extra path segments.
2. Pick a strict stable SemVer `x.y.z` (no leading zeros in these numbers, no prerelease). Optional `+build.metadata` is allowed; build identifiers contain ASCII alphanumeric characters or hyphens separated by dots. Build identifiers may have leading zeros. Versions are at most 128 characters and each numeric version component must fit an unsigned 64-bit integer.
3. Create a non-draft, non-prerelease GitHub Release with tag exactly the version or `v` followed by the version.
4. Upload **exactly `theme.json` and `theme.css` as release assets**, spelled precisely that way. GitHub's automatically generated source archives are not uploaded assets and do not count. Do not attach `main.js`, an inventory file, or other files. The two assets together must be at most **4 MiB (4,194,304 bytes)**.
5. Calculate each uploaded file's byte size and lowercase SHA-256 digest. For local files, for example:

   ```bash
   node --input-type=module -e 'import fs from "node:fs"; import { createHash } from "node:crypto"; console.log(JSON.stringify(["theme.json", "theme.css"].map(name => { const bytes = fs.readFileSync(name); return { name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; }), null, 2));'
   ```

Never move a reviewed tag or replace reviewed release assets. Publish a new version and submit updated hashes instead. Tag resolution plus the two reviewed hashes pins the downloaded bytes; no aggregate `candidateSha256` is used. There is no `/latest` resolution or raw repository file fallback.

## 3. Submit the reviewed index entry

Open a PR adding an entry to `themes` in `community-themes.json`. The root permits **only** optional string `$schema` and required array `themes`. Each entry permits **only**:

| Field | Requirement |
| --- | --- |
| `id` | Valid namespaced theme id, exactly matching `theme.json`. |
| `name` | Non-empty display name, exactly matching `theme.json`. |
| `author` | Non-empty maintainer/team name; matches manifest author when present. |
| `description` | Non-empty description for discovery. |
| `repo` | GitHub `owner/repo` containing the release. |
| `mode` | `light` or `dark`, exactly matching `theme.json`. |
| `listed` | Optional boolean, defaults to `true`. |
| `release` | Required unless `listed` is `false`. Exactly `tag`, `version`, `assets`. |

`release.assets` is an array of exactly two unique objects, one named `theme.json`, one named `theme.css`, in either order. Each contains **only** `name`, non-negative integer byte `size`, and lowercase 64-character hex `sha256`. Use the actual tag/version and actual inventory from your published release; do not invent hashes or placeholder releases.

Provide repository ownership evidence and the release URL in the PR. Maintainers review the source, both assets, identity, CSS, and checksums before merging. Unknown fields are rejected at every object boundary. The [JSON Schema](community-themes.schema.json) provides editor validation; the script additionally checks id uniqueness, combined byte size and tag/version equality, which JSON Schema cannot express here.

## 4. Validate

```bash
npm run validate:themes          # Local index checks
npm run validate:themes:remote   # Check the reviewed tag and actual downloaded bytes
npm run validate                # Both plugin and theme indexes
npm run test:run                 # Both validators' tests; npm test is also supported
npm run validate:remote         # Both registries' remote checks
```

Remote theme validation resolves `/releases/tags/<reviewed-tag>`, checks repository identity and stable release metadata, checks the exact asset set, downloads at most each reviewed size, compares byte counts and SHA-256, and validates the downloaded manifest against the entry. It does not require a Plugin executable or Plugin release inventory. CI runs standard local validation, tests, and remote validation for both registries.

## Unlisting and restoration

For a broken, unsafe, or disputed theme, preserve the reviewed identity, set `listed: false`, and **remove `release` entirely**. This retains the id reservation while stopping new discovery/updates; it does not remotely remove already-installed copies. To restore, omit `listed` or set it to `true` and supply a newly verified release record. Review ownership transfers with maintainer confirmation as for Plugins. The `registry:unlist` / `registry:restore` scripts operate only on executable Plugins; edit theme entries through a reviewed PR and run the theme validator.
