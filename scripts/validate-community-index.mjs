#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(ROOT, "community-plugins.json");
const PLUGIN_ID = /^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*[a-z0-9]$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CORE_ASSETS = new Set(["manifest.json", "main.js", "styles.css"]);
const THEME_ASSET = /^theme-([a-z0-9][a-z0-9-]*)\.(json|css)$/;

export function checksumCandidate(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(Buffer.from(file.name));
    hash.update(new Uint8Array([0]));
    hash.update(Buffer.from(String(file.content.byteLength)));
    hash.update(new Uint8Array([0]));
    hash.update(file.content);
    hash.update(new Uint8Array([0]));
  }
  return hash.digest("hex");
}

export function validateIndexShape(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.plugins)) {
    return ['Missing or invalid "plugins" array'];
  }
  const rootExtras = Object.keys(parsed).filter(
    (key) => !["$schema", "plugins"].includes(key),
  );
  if (rootExtras.length) errors.push(`Unknown root fields: ${rootExtras.join(", ")}`);
  const ids = new Set();
  parsed.plugins.forEach((entry, index) => {
    const p = `plugins[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${p}: must be an object`);
      return;
    }
    const extras = Object.keys(entry).filter(
      (key) =>
        !["id", "name", "author", "description", "repo", "listed", "release"].includes(
          key,
        ),
    );
    if (extras.length) errors.push(`${p}: unknown fields ${extras.join(", ")}`);
    for (const field of ["id", "name", "author", "description", "repo"]) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) {
        errors.push(`${p}.${field}: missing or invalid`);
      }
    }
    if (typeof entry.id === "string") {
      if (!PLUGIN_ID.test(entry.id) || entry.id.startsWith("phials.")) {
        errors.push(`${p}.id: invalid or reserved`);
      }
      if (ids.has(entry.id)) errors.push(`${p}.id: duplicate "${entry.id}"`);
      ids.add(entry.id);
    }
    if (typeof entry.repo === "string" && !REPO.test(entry.repo)) {
      errors.push(`${p}.repo: expected owner/repo`);
    }
    if (entry.listed !== undefined && typeof entry.listed !== "boolean") {
      errors.push(`${p}.listed: must be boolean`);
    }
    if (entry.listed === false) {
      if (entry.release !== undefined) {
        errors.push(`${p}.release: omit while temporarily unlisted`);
      }
      return;
    }
    const release = entry.release;
    if (!release || typeof release !== "object" || Array.isArray(release)) {
      errors.push(`${p}.release: required when listed`);
      return;
    }
    const releaseExtras = Object.keys(release).filter(
      (key) => !["tag", "version", "candidateSha256", "assets"].includes(key),
    );
    if (releaseExtras.length)
      errors.push(`${p}.release: unknown fields ${releaseExtras.join(", ")}`);
    if (!STABLE_SEMVER.test(release.version ?? "")) {
      errors.push(`${p}.release.version: expected stable SemVer`);
    }
    if (
      typeof release.tag !== "string" ||
      ![release.version, `v${release.version}`].includes(release.tag)
    ) {
      errors.push(`${p}.release.tag: must match version with an optional v prefix`);
    }
    if (!SHA256.test(release.candidateSha256 ?? "")) {
      errors.push(`${p}.release.candidateSha256: invalid`);
    }
    if (!Array.isArray(release.assets)) {
      errors.push(`${p}.release.assets: required`);
      return;
    }
    const assetNames = new Set();
    const themePairs = new Map();
    for (const [assetIndex, asset] of release.assets.entries()) {
      const ap = `${p}.release.assets[${assetIndex}]`;
      if (!asset || typeof asset !== "object") {
        errors.push(`${ap}: must be an object`);
        continue;
      }
      const assetExtras = Object.keys(asset).filter(
        (key) => !["name", "size", "sha256"].includes(key),
      );
      if (assetExtras.length) errors.push(`${ap}: unknown fields ${assetExtras.join(", ")}`);
      if (typeof asset.name !== "string" || assetNames.has(asset.name)) {
        errors.push(`${ap}.name: missing or duplicate`);
      } else {
        assetNames.add(asset.name);
      }
      if (!Number.isSafeInteger(asset.size) || asset.size < 0)
        errors.push(`${ap}.size: invalid`);
      if (!SHA256.test(asset.sha256 ?? "")) errors.push(`${ap}.sha256: invalid`);
      if (!CORE_ASSETS.has(asset.name)) {
        const theme = asset.name?.match(THEME_ASSET);
        if (!theme) errors.push(`${ap}.name: unsupported/noncanonical`);
        else {
          const extensions = themePairs.get(theme[1]) ?? new Set();
          extensions.add(theme[2]);
          themePairs.set(theme[1], extensions);
        }
      }
    }
    for (const required of ["manifest.json", "main.js"]) {
      if (!assetNames.has(required)) errors.push(`${p}.release.assets: missing ${required}`);
    }
    for (const [slug, extensions] of themePairs) {
      if (!extensions.has("json") || !extensions.has("css")) {
        errors.push(`${p}.release.assets: incomplete theme pair "${slug}"`);
      }
    }
  });
  return errors;
}

async function fetchOk(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "phials-registry-validator" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

export async function validateListedRelease(entry, fetchImpl = fetch) {
  const errors = [];
  try {
    const repo = await (await fetchOk(fetchImpl, `https://api.github.com/repos/${entry.repo}`)).json();
    if (repo.full_name?.toLowerCase() !== entry.repo.toLowerCase()) {
      errors.push(`${entry.id}: repository ownership/path redirected to ${repo.full_name ?? "unknown"}`);
    }
    const release = await (
      await fetchOk(fetchImpl, `https://api.github.com/repos/${entry.repo}/releases/latest`)
    ).json();
    if (release.draft || release.prerelease) errors.push(`${entry.id}: latest release is not stable`);
    if (release.tag_name !== entry.release.tag) errors.push(`${entry.id}: latest tag mismatch`);
    const actualNames = (release.assets ?? []).map((asset) => asset.name).sort();
    const expectedNames = entry.release.assets.map((asset) => asset.name).sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      errors.push(`${entry.id}: exact release asset set mismatch`);
    }
    const files = [];
    for (const expected of entry.release.assets) {
      const asset = release.assets?.find((candidate) => candidate.name === expected.name);
      if (!asset) continue;
      const content = new Uint8Array(
        await (await fetchOk(fetchImpl, asset.browser_download_url)).arrayBuffer(),
      );
      const digest = createHash("sha256").update(content).digest("hex");
      if (asset.size !== expected.size || content.byteLength !== expected.size || digest !== expected.sha256) {
        errors.push(`${entry.id}: mutable or mismatched asset ${expected.name}`);
      }
      files.push({ name: expected.name, content });
    }
    if (files.length === entry.release.assets.length) {
      if (checksumCandidate(files) !== entry.release.candidateSha256) {
        errors.push(`${entry.id}: candidate checksum mismatch`);
      }
      const manifestFile = files.find((file) => file.name === "manifest.json");
      if (manifestFile) {
        const manifest = JSON.parse(Buffer.from(manifestFile.content).toString("utf8"));
        if (manifest.id !== entry.id || manifest.version !== entry.release.version) {
          errors.push(`${entry.id}: registry/release manifest identity mismatch`);
        }
        const expectedRepo = `https://github.com/${entry.repo}`.toLowerCase();
        if (manifest.repository?.replace(/\.git$|\/+$/g, "").toLowerCase() !== expectedRepo) {
          errors.push(`${entry.id}: manifest repository mismatch`);
        }
      }
    }
  } catch (error) {
    errors.push(`${entry.id}: unavailable repository/release (${error.message})`);
  }
  return errors;
}

export async function validateRegistry(parsed, { remote = false, fetchImpl = fetch } = {}) {
  const errors = validateIndexShape(parsed);
  if (!errors.length && remote) {
    for (const entry of parsed.plugins.filter((plugin) => plugin.listed !== false)) {
      errors.push(...(await validateListedRelease(entry, fetchImpl)));
    }
  }
  return errors;
}

async function main() {
  const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  const errors = await validateRegistry(parsed, {
    remote: process.argv.includes("--remote"),
  });
  if (errors.length) {
    console.error("community-plugins.json validation failed:\n");
    for (const error of errors) console.error(" -", error);
    process.exit(1);
  }
  console.log(
    `community-plugins.json OK (${parsed.plugins.filter((entry) => entry.listed !== false).length} listed, ${parsed.plugins.filter((entry) => entry.listed === false).length} temporarily unlisted)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
