import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  MAX_THEME_BYTES,
  validateIndexShape,
  validateRegistry,
  validateThemeManifest,
} from "./validate-community-themes.mjs";

function fixture(manifestOverrides = {}) {
  const manifest = {
    id: "example.theme",
    name: "Example",
    mode: "dark",
    author: "Example",
    ...manifestOverrides,
  };
  const files = {
    "theme.json": Buffer.from(JSON.stringify(manifest)),
    "theme.css": Buffer.from(":root { --background: black; }"),
  };
  const entry = {
    id: "example.theme",
    name: "Example",
    author: "Example",
    description: "Test theme",
    repo: "example/theme",
    mode: "dark",
    release: {
      tag: "v1.2.3+build.01",
      version: "1.2.3+build.01",
      assets: Object.entries(files).map(([name, content]) => ({
        name,
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      })),
    },
  };
  return { entry, files, manifest };
}
const shape = (entry) => validateIndexShape({ themes: [entry] });
const invalid = (entry, pattern) => assert.match(shape(entry).join("\n"), pattern);

function fixtureFetch(entry, files, overrides = {}) {
  return async (url) => {
    const base = `https://api.github.com/repos/${entry.repo}`;
    if (overrides.unavailable) return new Response("missing", { status: 404 });
    if (url === base) return Response.json({ full_name: overrides.repo ?? entry.repo });
    if (url === `${base}/releases/tags/${encodeURIComponent(entry.release.tag)}`) {
      return Response.json({
        tag_name: entry.release.tag,
        draft: false,
        prerelease: false,
        assets: entry.release.assets.map((asset) => ({
          ...asset,
          browser_download_url: `https://github.com/${entry.repo}/releases/download/${entry.release.tag}/${asset.name}`,
        })),
        ...overrides.release,
      });
    }
    const name = new URL(url).pathname.split("/").at(-1);
    assert.ok(name in files, `Unexpected request: ${url}`);
    return new Response(overrides.contents?.[name] ?? files[name]);
  };
}

test("empty index and exact standalone pair are valid without main.js or candidate hash", () => {
  assert.deepEqual(
    validateIndexShape({ $schema: "./community-themes.schema.json", themes: [] }),
    [],
  );
  const { entry } = fixture();
  assert.deepEqual(shape(entry), []);
  entry.listed = true;
  assert.deepEqual(shape(entry), []);
  entry.release.assets.reverse();
  assert.deepEqual(shape(entry), []);
});

test("rejects malformed root and unknown keys at every index object boundary", () => {
  for (const root of [
    null,
    [],
    {},
    { themes: {} },
    { themes: [], plugins: [] },
    { themes: [], $schema: 3 },
  ])
    assert.ok(validateIndexShape(root).length);
  assert.ok(validateIndexShape({ themes: [null, []] }).length);
  for (const mutate of [
    (e) => {
      e.main = "main.js";
    },
    (e) => {
      e.release.candidateSha256 = "a".repeat(64);
    },
    (e) => {
      e.release.assets[0].url = "https://example.org";
    },
  ]) {
    const { entry } = fixture();
    mutate(entry);
    invalid(entry, /unknown fields/);
  }
});

test("namespaced ids enforce segment grammar, length and reserved namespaces", () => {
  for (const id of ["a.b", "my-vendor.a.b-c", "a." + "b".repeat(126)]) {
    const { entry } = fixture();
    entry.id = id;
    assert.deepEqual(shape(entry), [], id);
  }
  for (const id of [
    "theme",
    "A.b",
    "a.B",
    "a..b",
    "a.-b",
    "a.b-",
    "-a.b",
    "1a.b",
    "phi.a",
    "phials.a",
    "phoundry.a",
    "a." + "b".repeat(127),
    "a.b\n",
  ]) {
    const { entry } = fixture();
    entry.id = id;
    invalid(entry, /\.id:/);
  }
});

test("GitHub repository slugs reject URLs, suffixes, traversal and extra paths", () => {
  for (const repo of ["a/b", "Owner-1/repo.name_-", "a/.hidden"]) {
    const { entry } = fixture();
    entry.repo = repo;
    assert.deepEqual(shape(entry), [], repo);
  }
  for (const repo of [
    "https://github.com/a/b",
    "a/b/c",
    "a/b?x",
    "a/b#x",
    "a/.",
    "a/..",
    "./b",
    "a_/b",
    "a./b",
    "-a/b",
    "a-/b",
    "a/b.git",
    "a/b.GIT",
    "a/b\n",
    "a".repeat(40) + "/b",
    "a/" + "b".repeat(101),
    "a/",
    "/b",
  ]) {
    const { entry } = fixture();
    entry.repo = repo;
    invalid(entry, /\.repo:/);
  }
});

test("required metadata, strict stable SemVer and matching tags", () => {
  for (const field of ["name", "author", "description", "repo", "mode"]) {
    const { entry } = fixture();
    delete entry[field];
    assert.ok(shape(entry).length, field);
  }
  for (const version of ["0.0.0", "10.20.30", "1.0.0+01.ab-c"]) {
    for (const tag of [version, `v${version}`]) {
      const { entry } = fixture();
      Object.assign(entry.release, { version, tag });
      assert.deepEqual(shape(entry), []);
    }
  }
  for (const version of [
    "01.0.0",
    "1.02.0",
    "1.0.03",
    "1.0",
    "v1.0.0",
    "1.0.0-rc.1",
    "1.0.0+",
    "1.0.0+a..b",
    "1.0.0\n",
    "18446744073709551616.0.0",
    "1.0.0+" + "a".repeat(128),
    123,
  ]) {
    const { entry } = fixture();
    entry.release.version = version;
    invalid(entry, /version/);
  }
  const { entry } = fixture();
  entry.release.tag = "v2.0.0";
  invalid(entry, /tag/);
});

test("unlisted entries omit release and still reserve their unique id", async () => {
  const { entry } = fixture();
  entry.listed = false;
  invalid(entry, /omit while unlisted/);
  delete entry.release;
  assert.deepEqual(
    await validateRegistry(
      { themes: [entry] },
      {
        remote: true,
        fetchImpl: () => {
          throw new Error("must not fetch");
        },
      },
    ),
    [],
  );
  assert.match(validateIndexShape({ themes: [entry, entry] }).join("\n"), /duplicate/);
  delete entry.listed;
  invalid(entry, /required when listed/);
  entry.listed = "false";
  invalid(entry, /must be boolean/);
});

test("asset inventory rejects missing, duplicate, extra, invalid, and oversized records", () => {
  for (const mutate of [
    (e) => e.release.assets.pop(),
    (e) => {
      e.release.assets[1] = e.release.assets[0];
    },
    (e) => e.release.assets.push({ ...e.release.assets[1], name: "main.js" }),
    (e) => {
      e.release.assets[0] = null;
    },
    (e) => {
      e.release.assets[0] = [];
    },
    (e) => {
      e.release.assets[0].size = -1;
    },
    (e) => {
      e.release.assets[0].size = 0.5;
    },
    (e) => {
      e.release.assets[0].size = Number.MAX_SAFE_INTEGER + 1;
    },
    (e) => {
      e.release.assets[0].sha256 = "A".repeat(64);
    },
    (e) => {
      e.release.assets[0].sha256 = "a".repeat(63);
    },
    (e) => {
      e.release.assets[0].sha256 += "\n";
    },
    (e) => {
      e.release.assets[0].size = MAX_THEME_BYTES;
      e.release.assets[1].size = 1;
    },
  ]) {
    const { entry } = fixture();
    mutate(entry);
    assert.ok(shape(entry).length);
  }
  const { entry } = fixture();
  entry.release.assets[0].size = MAX_THEME_BYTES;
  entry.release.assets[1].size = 0;
  assert.deepEqual(shape(entry), []);
});

test("manifest allows only identity, optional author and preview color strings", () => {
  const { entry, manifest } = fixture();
  delete manifest.author;
  manifest.preview = { background: "#000", foreground: "white", accent: "oklch(60% 0.1 200)" };
  assert.deepEqual(validateThemeManifest(manifest, entry), []);
  for (const value of [
    null,
    [],
    { ...manifest, main: "main.js" },
    { ...manifest, version: "1.0.0" },
    { ...manifest, author: "Other" },
    { ...manifest, mode: "light" },
    { ...manifest, name: "Other" },
    { ...manifest, id: "other.theme" },
    { ...manifest, preview: [] },
    { ...manifest, preview: { ...manifest.preview, extra: "red" } },
    { ...manifest, preview: { background: " " } },
  ])
    assert.ok(validateThemeManifest(value, entry).length);
});

test("remote checks tag endpoint and bytes, not latest, with no executable asset", async () => {
  const { entry, files } = fixture();
  assert.deepEqual(
    await validateRegistry(
      { themes: [entry] },
      { remote: true, fetchImpl: fixtureFetch(entry, files) },
    ),
    [],
  );
});

test("remote rejects release metadata, redirects, missing or unexpected assets and mutable bytes", async () => {
  const { entry, files } = fixture();
  for (const options of [
    { unavailable: true },
    { repo: "other/theme" },
    { release: { tag_name: "v9.0.0" } },
    { release: { draft: true } },
    { release: { prerelease: true } },
    { release: { assets: [] } },
    { release: { assets: [...entry.release.assets, { name: "main.js" }] } },
    { contents: { "theme.css": Buffer.from("changed bytes") } },
    { contents: { "theme.css": Buffer.alloc(files["theme.css"].length, 32) } },
    { contents: { "theme.css": Buffer.alloc(files["theme.css"].length + 1) } },
  ])
    assert.ok(
      (
        await validateRegistry(
          { themes: [entry] },
          { remote: true, fetchImpl: fixtureFetch(entry, files, options) },
        )
      ).length,
      JSON.stringify(options),
    );
});

test("remote validates actual manifest semantics even when reviewed hashes match", async () => {
  for (const overrides of [
    { id: "other.theme" },
    { name: "Other" },
    { author: "Other" },
    { mode: "light" },
    { main: "main.js" },
    { preview: { background: "black" } },
  ]) {
    const { entry, files } = fixture(overrides);
    assert.ok(
      (
        await validateRegistry(
          { themes: [entry] },
          { remote: true, fetchImpl: fixtureFetch(entry, files) },
        )
      ).length,
    );
  }
});

test("invalid local inventory never causes remote requests", async () => {
  const { entry } = fixture();
  entry.release.assets[0].size = MAX_THEME_BYTES + 1;
  assert.ok(
    (
      await validateRegistry(
        { themes: [entry] },
        {
          remote: true,
          fetchImpl: () => {
            assert.fail("must not fetch invalid index");
          },
        },
      )
    ).length,
  );
});
