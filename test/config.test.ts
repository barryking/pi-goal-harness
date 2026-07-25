import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	configPath,
	currentModelConfig,
	loadConfig,
	OPENAI_CODEX_PRESET,
	writeConfig,
} from "../extensions/goal-harness/config.ts";

const root = mkdtempSync(join(tmpdir(), "pi-goal-harness-config-"));
process.env.PI_GOAL_HARNESS_HOME = root;

test("uses the documented OpenAI preset when no user config exists", () => {
	const config = loadConfig();
	assert.deepEqual(config, OPENAI_CODEX_PRESET);
	assert.equal(configPath(), join(root, "config.json"));
});

test("writes a namespaced current-model configuration with private permissions", () => {
	const config = currentModelConfig("example-provider", "fast-model", "low");
	const target = writeConfig(config);
	assert.equal(target, join(root, "config.json"));
	assert.equal(statSync(target).mode & 0o777, 0o600);

	const parsed = JSON.parse(readFileSync(target, "utf8"));
	assert.equal(parsed.provider, "example-provider");
	assert.equal(parsed.planner.model, "fast-model");
	assert.equal(parsed.executor.model, "fast-model");
	assert.equal(loadConfig().verifier.model, "fast-model");
});
