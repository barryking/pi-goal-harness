import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	configPath,
	configuredModels,
	currentModelConfig,
	HARNESS_SETUP_PRESETS,
	loadConfig,
	OPENAI_CODEX_PRESET,
	writeConfig,
} from "../extensions/goal-harness/config.ts";

const root = mkdtempSync(join(tmpdir(), "pi-goal-harness-config-"));
process.env.PI_GOAL_HARNESS_HOME = root;

test("uses the documented OpenAI preset when no user config exists", () => {
	const config = loadConfig();
	assert.deepEqual(config, OPENAI_CODEX_PRESET);
	assert.equal(config.reviewPolicy, "final");
	assert.equal(config.memory.storeColdEvidence, false);
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
	assert.equal(parsed.stepVerifier.model, "fast-model");
	assert.equal(loadConfig().verifier.model, "fast-model");
});

test("setup presets are data-driven and expose unique configured models", () => {
	const openai = HARNESS_SETUP_PRESETS.find((preset) => preset.id === "openai");
	const current = HARNESS_SETUP_PRESETS.find((preset) => preset.id === "current");
	assert.ok(openai);
	assert.ok(current);
	assert.deepEqual(openai.create(), OPENAI_CODEX_PRESET);
	assert.equal(current.create(), undefined);

	const portable = current.create({ provider: "example", id: "model" });
	assert.ok(portable);
	assert.deepEqual(configuredModels(portable), [{ provider: "example", id: "model" }]);
});
