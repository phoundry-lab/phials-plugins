#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(ROOT, "community-plugins.json");

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function updateListingState(index, action, pluginId, inventory, tag) {
  const entry = index.plugins?.find((candidate) => candidate.id === pluginId);
  if (!entry) throw new Error(`Unknown registry plugin "${pluginId}"`);

  if (action === "unlist") {
    entry.listed = false;
    delete entry.release;
    return index;
  }
  if (action !== "restore") {
    throw new Error('Action must be "unlist" or "restore"');
  }
  if (!inventory?.identity || !inventory?.candidate) {
    throw new Error("Restoration requires a release inventory");
  }
  if (inventory.identity.id !== pluginId) {
    throw new Error(
      `Inventory identity "${inventory.identity.id}" does not match "${pluginId}"`,
    );
  }
  if (
    typeof tag !== "string" ||
    ![inventory.identity.version, `v${inventory.identity.version}`].includes(tag)
  ) {
    throw new Error(
      `Tag must be ${inventory.identity.version} or v${inventory.identity.version}`,
    );
  }
  entry.listed = true;
  entry.release = {
    tag,
    version: inventory.identity.version,
    candidateSha256: inventory.candidate.sha256,
    assets: inventory.candidate.files,
  };
  return index;
}

function writeJsonAtomically(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function main() {
  const args = process.argv.slice(2);
  const [action, pluginId] = args;
  if (!action || !pluginId) {
    throw new Error(
      "Usage: listing-state.mjs unlist <plugin-id> | restore <plugin-id> --inventory <path> --tag <tag>",
    );
  }
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  const inventoryPath = readFlag(args, "--inventory");
  const inventory = inventoryPath
    ? JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"))
    : undefined;
  updateListingState(index, action, pluginId, inventory, readFlag(args, "--tag"));
  writeJsonAtomically(INDEX_PATH, index);
  console.log(`${pluginId}: ${action === "unlist" ? "temporarily unlisted" : "restored"}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
