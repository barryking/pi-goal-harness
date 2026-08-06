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
	fixedModelConfig,
	formatConfig,
	GOALA_SETUP_PRESETS,
	loadConfig,
	PI_DEFAULT_CONFIG,
	writeConfig,
} from "../extensions/goala/config.ts";

const root = mkdtempSync(join(tmpdir(), "pi-goala-config-"));
process.env.PI_GOALA_HOME = root;

test("uses Pi's dynamic default model when no user config exists", () => {
	const config = loadConfig();
	assert.deepEqual(config, PI_DEFAULT_CONFIG);
	assert.equal(config.reviewPolicy, "final");
	assert.equal(configPath(), join(root, "config.json"));
});

test("writes a namespaced fixed-model configuration with private permissions", () => {
	const config = fixedModelConfig("example-provider", "fast-model", "low");
	const target = writeConfig(config);
	assert.equal(target, join(root, "config.json"));
	assert.equal(statSync(target).mode & 0o777, 0o600);

	const parsed = JSON.parse(readFileSync(target, "utf8"));
	assert.equal(parsed.configVersion, 4);
	assert.equal(parsed.provider, undefined);
	assert.equal(parsed.planner.provider, "example-provider");
	assert.equal(parsed.planner.model, "fast-model");
	assert.equal(parsed.executor.provider, "example-provider");
	assert.equal(parsed.executor.model, "fast-model");
	assert.equal(parsed.stepVerifier.model, "fast-model");
	const loaded = loadConfig();
	assert.equal(loaded.verifier.kind, "fixed");
	if (loaded.verifier.kind === "fixed") {
		assert.equal(loaded.verifier.model, "fast-model");
	}
});

test("setup presets are data-driven and expose unique configured models", () => {
	const defaults = GOALA_SETUP_PRESETS.find((preset) => preset.id === "default");
	assert.ok(defaults);
	assert.deepEqual(defaults.create(), PI_DEFAULT_CONFIG);
	assert.deepEqual(configuredModels(defaults.create()), []);
	assert.equal(GOALA_SETUP_PRESETS.some((preset) => preset.id === "openai"), false);
	assert.equal(GOALA_SETUP_PRESETS.some((preset) => preset.id === "current"), false);
});

test("supports a different provider and model for every role", () => {
	const config = structuredClone(PI_DEFAULT_CONFIG);
	config.planner = { kind: "fixed", provider: "provider-a", model: "planner", thinkingLevel: "high" };
	config.executor = { kind: "fixed", provider: "provider-b", model: "executor", thinkingLevel: "low" };
	config.stepVerifier = { kind: "fixed", provider: "provider-c", model: "step", thinkingLevel: "medium" };
	config.verifier = { kind: "fixed", provider: "provider-d", model: "verifier", thinkingLevel: "xhigh" };
	config.fallbackExecutor = {
		kind: "fixed",
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
	assert.match(
		formatConfig(config),
		/Fallback executor: provider-e\/repair · medium reasoning/,
	);
	assert.match(
		formatConfig(config),
		/Fallback executor activates after: 2 failed verification attempts/,
	);
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
	assert.equal(migrated.configVersion, 4);
	assert.equal(migrated.planner.kind, "fixed");
	assert.equal(migrated.executor.kind, "fixed");
	if (migrated.planner.kind === "fixed") {
		assert.equal(migrated.planner.provider, "legacy-provider");
		assert.equal(migrated.planner.model, "plan-model");
	}
	if (migrated.executor.kind === "fixed") {
		assert.equal(migrated.executor.provider, "legacy-provider");
		assert.equal(migrated.executor.model, "code-model");
	}
	assert.equal(migrated.verifier.kind, "pi-default");
	assert.equal("provider" in migrated, false);

	const persisted = JSON.parse(readFileSync(writeConfig(migrated), "utf8"));
	assert.equal(persisted.provider, undefined);
	assert.equal(persisted.configVersion, 4);
});

test("drops legacy memory configuration instead of retaining a compatibility path", () => {
	writeFileSync(
		configPath(),
		JSON.stringify({
			configVersion: 2,
			memory: { enabled: true, autoRecall: true },
		}),
	);

	const migrated = loadConfig();
	assert.equal(migrated.configVersion, 4);
	assert.equal("memory" in migrated, false);
	assert.equal("memory" in JSON.parse(readFileSync(writeConfig(migrated), "utf8")), false);
});
