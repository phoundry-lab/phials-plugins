#!/usr/bin/env node
/**
 * Validates community-plugins.json. Keep rules aligned with Phials:
 * src/plugins/loader/manifest-schema.ts (validateCommunityPluginsIndex).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "community-plugins.json");

const PLUGIN_ID = /^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*[a-z0-9]$/;
const GITHUB_REPO_PATH =
	/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

function isReservedId(id) {
	return id.startsWith("phials.");
}

function validateEntry(entry, index) {
	const prefix = `plugins[${index}]`;
	const errors = [];
	if (!entry || typeof entry !== "object") {
		return [`${prefix}: must be an object`];
	}
	const e = entry;
	const keys = Object.keys(e);
	const allowed = new Set(["id", "name", "author", "description", "repo"]);
	for (const k of keys) {
		if (!allowed.has(k)) errors.push(`${prefix}: unknown field "${k}"`);
	}
	for (const field of ["id", "name", "author", "description", "repo"]) {
		const v = e[field];
		if (typeof v !== "string" || !v.trim()) {
			errors.push(`${prefix}.${field}: missing or invalid`);
		}
	}
	if (typeof e.id === "string" && e.id.trim()) {
		const id = e.id.trim();
		if (!PLUGIN_ID.test(id)) {
			errors.push(`${prefix}.id: invalid format (vendor.plugin-name, lowercase)`);
		} else if (isReservedId(id)) {
			errors.push(`${prefix}.id: reserved prefix "phials." is not allowed`);
		}
	}
	if (typeof e.repo === "string" && e.repo.trim()) {
		if (!GITHUB_REPO_PATH.test(e.repo.trim())) {
			errors.push(
				`${prefix}.repo: must be "owner/repo" (no URL or leading slash)`,
			);
		}
	}
	return errors;
}

function main() {
	const raw = fs.readFileSync(INDEX_PATH, "utf8");
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		console.error("Invalid JSON:", err.message);
		process.exit(1);
	}

	const errors = [];
	if (!parsed || typeof parsed !== "object") {
		console.error("Index must be a JSON object");
		process.exit(1);
	}
	const allowedRoot = new Set(["plugins", "$schema"]);
	for (const k of Object.keys(parsed)) {
		if (!allowedRoot.has(k)) {
			errors.push(`Unknown top-level field: ${k}`);
		}
	}
	const plugins = parsed.plugins;
	if (!Array.isArray(plugins)) {
		console.error('Missing or invalid "plugins" array');
		process.exit(1);
	}

	const seenIds = new Map();
	for (let i = 0; i < plugins.length; i++) {
		errors.push(...validateEntry(plugins[i], i));
		const id = plugins[i]?.id;
		if (typeof id === "string" && id.trim()) {
			const t = id.trim();
			const prev = seenIds.get(t);
			if (prev !== undefined) {
				errors.push(
					`Duplicate plugin id "${t}" at plugins[${i}] (also plugins[${prev}])`,
				);
			} else {
				seenIds.set(t, i);
			}
		}
	}

	if (errors.length) {
		console.error("community-plugins.json validation failed:\n");
		for (const line of errors) console.error(" -", line);
		process.exit(1);
	}
	console.log("community-plugins.json OK");
}

main();
