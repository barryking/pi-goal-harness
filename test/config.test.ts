import assert from "node:assert/strict";
import {
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	configPath,
	configuredModels,
	currentModelConfig,
	GOALA_SETUP_PRESETS,
	loadConfig,
	OPENAI_CODEX_PRESET,
	writeConfig,
} from "../extensions/goala/config.ts";

const root = mkdtempSync(join(tmpdir(), "pi-goala-config-"));
process.env.PI_GOALA_HOME = root;

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
	assert.equal(parsed.configVersion, 2);
	assert.equal(parsed.provider, undefined);
	assert.equal(parsed.planner.provider, "example-provider");
	assert.equal(parsed.planner.model, "fast-model");
	assert.equal(parsed.executor.provider, "example-provider");
	assert.equal(parsed.executor.model, "fast-model");
	assert.equal(parsed.stepVerifier.model, "fast-model");
	assert.equal(loadConfig().verifier.model, "fast-model");
});

test("setup presets are data-driven and expose unique configured models", () => {
	const openai = GOALA_SETUP_PRESETS.find((preset) => preset.id === "openai");
	const current = GOALA_SETUP_PRESETS.find((preset) => preset.id === "current");
	assert.ok(openai);
	assert.ok(current);
	assert.deepEqual(openai.create(), OPENAI_CODEX_PRESET);
	assert.equal(current.create(), undefined);

	const portable = current.create({ provider: "example", id: "model" });
	assert.ok(portable);
	assert.deepEqual(configuredModels(portable), [{ provider: "example", id: "model" }]);
});

test("supports a different provider and model for every role", () => {
	const config = structuredClone(OPENAI_CODEX_PRESET);
	config.planner = { provider: "provider-a", model: "planner", thinkingLevel: "high" };
	config.executor = { provider: "provider-b", model: "executor", thinkingLevel: "low" };
	config.stepVerifier = { provider: "provider-c", model: "step", thinkingLevel: "medium" };
	config.verifier = { provider: "provider-d", model: "verifier", thinkingLevel: "xhigh" };
	config.fallbackExecutor = {
		provider: "provider-e",
		model: "repair",
		thinkingLevel: "medium",
		afterRepairCycle: 2,
	};

	assert.deepEqual(configuredModels(config), [
		{ provider: "provider-a", id: "planner" },
		{ provider: "provider-b", id: "executor" },
		{ provider: "provider-e", id: "repair" },
		{ provider: "provider-c", id: "step" },
		{ provider: "provider-d", id: "verifier" },
	]);
});

test("migrates version 1 single-provider configuration without retaining the old field", () => {
	writeFileSync(
		configPath(),
		JSON.stringify({
			configVersion: 1,
			provider: "legacy-provider",
			planner: { model: "plan-model", thinkingLevel: "high" },
			executor: { model: "code-model", thinkingLevel: "low" },
		}),
	);

	const migrated = loadConfig();
	assert.equal(migrated.configVersion, 2);
	assert.equal(migrated.planner.provider, "legacy-provider");
	assert.equal(migrated.planner.model, "plan-model");
	assert.equal(migrated.executor.provider, "legacy-provider");
	assert.equal(migrated.executor.model, "code-model");
	assert.equal(migrated.verifier.provider, "legacy-provider");
	assert.equal("provider" in migrated, false);

	const persisted = JSON.parse(readFileSync(writeConfig(migrated), "utf8"));
	assert.equal(persisted.provider, undefined);
	assert.equal(persisted.configVersion, 2);
});
