import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  checksumCandidate,
  validateIndexShape,
  validateListedRelease,
} from "./validate-community-index.mjs";
import { updateListingState } from "./listing-state.mjs";

const manifest = Buffer.from(
  JSON.stringify({
    id: "example.contract",
    version: "1.0.0",
    repository: "https://github.com/example/contract",
  }),
);
const main = Buffer.from("export default { id: 'example.contract' }");
const files = [
  { name: "manifest.json", content: manifest },
  { name: "main.js", content: main },
];
const entry = {
  id: "example.contract",
  name: "Contract",
  author: "Example",
  description: "Fixture",
  repo: "example/contract",
  release: {
    tag: "v1.0.0",
    version: "1.0.0",
    candidateSha256: checksumCandidate(files),
    assets: files.map((file) => ({
      name: file.name,
      size: file.content.byteLength,
      sha256: createHash("sha256").update(file.content).digest("hex"),
    })),
  },
};

function fixtureFetch({ unavailable = false, mutateMain = false, extraAsset = false } = {}) {
  return async (url) => {
    if (unavailable) return new Response("missing", { status: 404 });
    if (url.endsWith("/repos/example/contract")) {
      return Response.json({ full_name: "example/contract" });
    }
    if (url.endsWith("/releases/latest")) {
      return Response.json({
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        assets: [
          ...entry.release.assets.map((asset) => ({
            ...asset,
            browser_download_url: `https://assets/${asset.name}`,
          })),
          ...(extraAsset
            ? [{ name: "chunk.js", size: 1, browser_download_url: "https://assets/chunk.js" }]
            : []),
        ],
      });
    }
    const name = url.split("/").at(-1);
    let content = name === "manifest.json" ? manifest : main;
    if (mutateMain && name === "main.js") content = Buffer.from("changed");
    return new Response(content);
  };
}

test("temporary unlisting is machine-valid and omits release metadata", () => {
  assert.deepEqual(
    validateIndexShape({ plugins: [{ ...entry, listed: false, release: undefined }] }),
    [],
  );
});

test("unlisting and restoration preserve the reviewed record", () => {
  const index = { plugins: [structuredClone(entry)] };
  updateListingState(index, "unlist", entry.id);
  assert.equal(index.plugins[0].listed, false);
  assert.equal(index.plugins[0].release, undefined);

  updateListingState(
    index,
    "restore",
    entry.id,
    {
      identity: { id: entry.id, version: entry.release.version },
      candidate: {
        sha256: entry.release.candidateSha256,
        files: entry.release.assets,
      },
    },
    entry.release.tag,
  );
  assert.equal(index.plugins[0].listed, true);
  assert.deepEqual(index.plugins[0].release, entry.release);
});

test("remote validation rejects unavailable releases", async () => {
  assert.match(
    (await validateListedRelease(entry, fixtureFetch({ unavailable: true }))).join("\n"),
    /unavailable/,
  );
});

test("remote validation rejects mutable candidate bytes", async () => {
  assert.match(
    (await validateListedRelease(entry, fixtureFetch({ mutateMain: true }))).join("\n"),
    /mutable or mismatched/,
  );
});

test("remote validation rejects unexpected release files", async () => {
  assert.match(
    (await validateListedRelease(entry, fixtureFetch({ extraAsset: true }))).join("\n"),
    /exact release asset set mismatch/,
  );
});
