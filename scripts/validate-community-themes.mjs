#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MAX_THEME_BYTES = 4 * 1024 * 1024;
const THEME_ID = /^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z](?:[a-z0-9-]*[a-z0-9])?)+$(?![\s\S])/;
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$(?![\s\S])/;
const STABLE_SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$(?![\s\S])/;
const SHA256 = /^[a-f0-9]{64}$(?![\s\S])/;
const ASSETS = ["theme.json", "theme.css"];
const has = (value, key) => Object.hasOwn(value, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && Boolean(value.trim());
const validId = (id) =>
  typeof id === "string" &&
  id.length <= 128 &&
  THEME_ID.test(id) &&
  !["phi.", "phials.", "phoundry."].some((prefix) => id.startsWith(prefix));

function checkKeys(value, allowed, label, errors) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) errors.push(`${label}: unknown fields ${extras.join(", ")}`);
}

export function validateIndexShape(parsed) {
  const errors = [];
  if (!record(parsed) || !Array.isArray(parsed.themes))
    return ['Missing or invalid "themes" array'];
  checkKeys(parsed, ["$schema", "themes"], "root", errors);
  if (has(parsed, "$schema") && typeof parsed.$schema !== "string")
    errors.push("$schema: must be a string");
  const ids = new Set();
  parsed.themes.forEach((entry, index) => {
    const p = `themes[${index}]`;
    if (!record(entry)) {
      errors.push(`${p}: must be an object`);
      return;
    }
    checkKeys(
      entry,
      ["id", "name", "author", "description", "repo", "mode", "listed", "release"],
      p,
      errors,
    );
    if (!validId(entry.id)) errors.push(`${p}.id: invalid or reserved (maximum 128 characters)`);
    if (typeof entry.id === "string") {
      if (ids.has(entry.id)) errors.push(`${p}.id: duplicate "${entry.id}"`);
      ids.add(entry.id);
    }
    for (const field of ["name", "author", "description"]) {
      if (!text(entry[field])) errors.push(`${p}.${field}: missing or invalid`);
    }
    if (typeof entry.repo !== "string" || !REPO.test(entry.repo) || /\.git$/i.test(entry.repo))
      errors.push(`${p}.repo: expected GitHub owner/repo without .git suffix`);
    if (!["light", "dark"].includes(entry.mode)) errors.push(`${p}.mode: expected light or dark`);
    if (has(entry, "listed") && typeof entry.listed !== "boolean")
      errors.push(`${p}.listed: must be boolean`);
    if (entry.listed === false) {
      if (has(entry, "release")) errors.push(`${p}.release: omit while unlisted`);
      return;
    }
    const release = entry.release;
    if (!record(release)) {
      errors.push(`${p}.release: required when listed`);
      return;
    }
    checkKeys(release, ["tag", "version", "assets"], `${p}.release`, errors);
    if (typeof release.version !== "string" || release.version.length > 128 || !STABLE_SEMVER.test(release.version) ||
        release.version.split("+")[0].split(".").some((part) => BigInt(part) > 18446744073709551615n))
      errors.push(`${p}.release.version: expected stable SemVer (optional build metadata)`);
    if (
      typeof release.tag !== "string" ||
      ![release.version, `v${release.version}`].includes(release.tag)
    )
      errors.push(`${p}.release.tag: must match version with an optional v prefix`);
    if (!Array.isArray(release.assets)) {
      errors.push(`${p}.release.assets: required`);
      return;
    }
    const names = new Set();
    let total = 0;
    for (const [i, asset] of release.assets.entries()) {
      const ap = `${p}.release.assets[${i}]`;
      if (!record(asset)) {
        errors.push(`${ap}: must be an object`);
        continue;
      }
      checkKeys(asset, ["name", "size", "sha256"], ap, errors);
      if (!ASSETS.includes(asset.name) || names.has(asset.name))
        errors.push(`${ap}.name: unsupported or duplicate`);
      names.add(asset.name);
      if (!Number.isSafeInteger(asset.size) || asset.size < 0)
        errors.push(`${ap}.size: expected non-negative integer`);
      else total += asset.size;
      if (typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256))
        errors.push(`${ap}.sha256: expected lowercase SHA-256`);
    }
    if (release.assets.length !== 2 || ASSETS.some((name) => !names.has(name)))
      errors.push(`${p}.release.assets: expected exactly theme.json and theme.css`);
    if (total > MAX_THEME_BYTES) errors.push(`${p}.release.assets: aggregate size exceeds 4 MiB`);
  });
  return errors;
}

export function validateThemeManifest(manifest, entry) {
  const errors = [];
  if (!record(manifest)) return ["theme.json: must be an object"];
  checkKeys(manifest, ["id", "name", "mode", "author", "preview"], "theme.json", errors);
  if (!validId(manifest.id) || !text(manifest.name) || !["light", "dark"].includes(manifest.mode))
    errors.push("theme.json: invalid identity");
  for (const field of ["id", "name", "mode"]) {
    if (manifest[field] !== entry[field]) errors.push(`theme.json: registry ${field} mismatch`);
  }
  if (has(manifest, "author") && (!text(manifest.author) || manifest.author !== entry.author))
    errors.push("theme.json: registry author mismatch");
  if (has(manifest, "preview")) {
    if (!record(manifest.preview)) errors.push("theme.json.preview: must be an object");
    else {
      checkKeys(
        manifest.preview,
        ["background", "foreground", "accent"],
        "theme.json.preview",
        errors,
      );
      for (const field of ["background", "foreground", "accent"]) {
        if (!text(manifest.preview[field]))
          errors.push(`theme.json.preview.${field}: expected non-empty color string`);
      }
    }
  }
  return errors;
}

async function fetchOk(fetchImpl, url, accept = "application/vnd.github+json") {
  const response = await fetchImpl(url, {
    headers: { Accept: accept, "User-Agent": "phials-registry-validator" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

// Read at most the reviewed size, not an unbounded response from a replaced asset.
async function download(fetchImpl, url, size) {
  const response = await fetchOk(fetchImpl, url, "application/octet-stream");
  const chunks = [];
  let length = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > size) throw new Error("asset bytes exceed reviewed size");
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks, length);
}

export async function validateListedRelease(entry, fetchImpl = fetch) {
  const errors = [];
  try {
    const base = `https://api.github.com/repos/${entry.repo}`;
    const repo = await (await fetchOk(fetchImpl, base)).json();
    if (
      typeof repo.full_name !== "string" ||
      repo.full_name.toLowerCase() !== entry.repo.toLowerCase()
    )
      throw new Error("repository ownership/path redirected");
    // Resolve the reviewed tag, never /latest or raw branch files. Hashes pin its bytes.
    const release = await (
      await fetchOk(fetchImpl, `${base}/releases/tags/${encodeURIComponent(entry.release.tag)}`)
    ).json();
    if (
      release.draft !== false ||
      release.prerelease !== false ||
      release.tag_name !== entry.release.tag
    )
      throw new Error("release is not the reviewed stable tag");
    const actual = release.assets;
    if (
      !Array.isArray(actual) ||
      actual.length !== 2 ||
      ASSETS.some((name) => actual.filter((asset) => asset.name === name).length !== 1)
    )
      throw new Error("exact release asset set mismatch");
    for (const expected of entry.release.assets) {
      const asset = actual.find((candidate) => candidate.name === expected.name);
      if (asset.size !== expected.size) {
        errors.push(`${entry.id}: asset size mismatch ${expected.name}`);
        continue;
      }
      const url = new URL(asset.browser_download_url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "github.com" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        decodeURIComponent(url.pathname) !==
          `/${entry.repo}/releases/download/${entry.release.tag}/${expected.name}`
      )
        throw new Error("unexpected release asset URL");
      const content = await download(fetchImpl, url.href, expected.size);
      if (
        content.byteLength !== expected.size ||
        createHash("sha256").update(content).digest("hex") !== expected.sha256
      )
        errors.push(`${entry.id}: mutable or mismatched asset ${expected.name}`);
      if (expected.name === "theme.json")
        errors.push(
          ...validateThemeManifest(
            JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)),
            entry,
          ).map((error) => `${entry.id}: ${error}`),
        );
    }
  } catch (error) {
    errors.push(`${entry.id}: unavailable or invalid release (${error.message})`);
  }
  return errors;
}

export async function validateRegistry(parsed, { remote = false, fetchImpl = fetch } = {}) {
  const errors = validateIndexShape(parsed);
  if (!errors.length && remote) {
    for (const entry of parsed.themes.filter((theme) => theme.listed !== false))
      errors.push(...(await validateListedRelease(entry, fetchImpl)));
  }
  return errors;
}

async function main() {
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "community-themes.json"), "utf8"));
  const errors = await validateRegistry(parsed, { remote: process.argv.includes("--remote") });
  if (errors.length) {
    console.error(
      "community-themes.json validation failed:\n" +
        errors.map((error) => ` - ${error}`).join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      `community-themes.json OK (${parsed.themes.filter((entry) => entry.listed !== false).length} listed, ${parsed.themes.filter((entry) => entry.listed === false).length} temporarily unlisted)`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
