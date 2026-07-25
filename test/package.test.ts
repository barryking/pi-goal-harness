import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("publishes a conventional, dependency-free Pi package", () => {
	assert.equal(manifest.name, "pi-goal-harness");
	assert.ok(manifest.keywords.includes("pi-package"));
	assert.deepEqual(manifest.pi.extensions, ["./extensions/goal-harness/index.ts"]);
	assert.equal(manifest.dependencies, undefined);
	assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], "*");
	assert.equal(manifest.peerDependencies["@earendil-works/pi-tui"], "*");
	assert.equal(manifest.peerDependencies.typebox, "*");
});

test("README foregrounds the product and keeps source attribution in acknowledgments", () => {
	const readme = readFileSync(resolve(root, "README.md"), "utf8");
	assert.match(readme, /plan → execute → independently verify/i);
	assert.match(readme, /## Influences and acknowledgments/);
	assert.doesNotMatch(readme, /## What it is not/);
});
