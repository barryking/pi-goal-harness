import assert from "node:assert/strict";
import test from "node:test";
import { OPENAI_CODEX_PRESET } from "../extensions/goala/config.ts";
import { selectModelRoles } from "../extensions/goala/setup.ts";

type Selection = [title: string, option: string];

function setupContext(models: object[], selections: Selection[]) {
	let refreshes = 0;
	const seenTitles: string[] = [];
	const ctx = {
		hasUI: true,
		modelRegistry: {
			async refresh() {
				refreshes += 1;
			},
			getAvailable: () => models,
			getProviderDisplayName: (provider: string) =>
				provider.replace("provider-", "Provider ").toUpperCase(),
		},
		ui: {
			notify() {},
			async select(title: string, options: string[]) {
				seenTitles.push(title);
				const expected = selections.shift();
				assert.ok(expected, `Unexpected selection: ${title}`);
				assert.ok(
					title.startsWith(expected[0]),
					`Expected title starting with "${expected[0]}", received "${title}"`,
				);
				const selected = options.find((option) => option.includes(expected[1]));
				assert.ok(
					selected,
					`Expected option containing "${expected[1]}" in ${options.join(", ")}`,
				);
				return selected;
			},
		},
	};
	return {
		ctx,
		seenTitles,
		refreshes: () => refreshes,
		assertComplete: () => assert.equal(selections.length, 0),
	};
}

test("setup supports keep, effort-only, tiered model selection, review, and editing", async () => {
	const models = [
		{ provider: "provider-a", id: "model-a", name: "Model A", reasoning: true },
		{ provider: "provider-b", id: "model-b", name: "Model B", reasoning: true },
		{ provider: "provider-b", id: "plain", name: "Plain", reasoning: false },
	];
	const selections: Selection[] = [
		["Planner", "Keep current"],
		["Executor", "Change reasoning effort"],
		["Executor reasoning effort", "High"],
		["Step verifier", "Change provider or model"],
		["Step verifier provider", "provider-b"],
		["Step verifier model", "model-b"],
		["Step verifier reasoning effort", "Extra high"],
		["Final verifier", "Keep current"],
		["Repair fallback", "Change provider or model"],
		["Repair fallback provider", "provider-b"],
		["Repair fallback model", "plain"],
		["Review Goala configuration", "Edit a phase"],
		["Choose a phase to edit", "Planner"],
		["Planner", "Change reasoning effort"],
		["Planner reasoning effort", "Low"],
		["Review Goala configuration", "Save configuration"],
	];
	const harness = setupContext(models, selections);
	const current = structuredClone(OPENAI_CODEX_PRESET);
	for (const role of [
		"planner",
		"executor",
		"stepVerifier",
		"verifier",
		"fallbackExecutor",
	] as const) {
		current[role].provider = "provider-a";
		current[role].model = "model-a";
		current[role].thinkingLevel = "medium";
	}
	current.fallbackExecutor.afterRepairCycle = 4;

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.ok(configured);
	assert.equal(harness.refreshes(), 1);
	harness.assertComplete();
	assert.equal(configured.planner.thinkingLevel, "low");
	assert.equal(configured.executor.thinkingLevel, "high");
	assert.deepEqual(configured.stepVerifier, {
		provider: "provider-b",
		model: "model-b",
		thinkingLevel: "xhigh",
	});
	assert.deepEqual(configured.fallbackExecutor, {
		provider: "provider-b",
		model: "plain",
		thinkingLevel: "off",
		afterRepairCycle: 4,
	});
	assert.match(
		harness.seenTitles.find((title) =>
			title.startsWith("Review Goala configuration"),
		) ?? "",
		/PROVIDER A \(provider-a\) \/ Model A \(model-a\) \/ Medium reasoning/,
	);
});

test("setup skips provider selection when only one provider is available", async () => {
	const models = [
		{ provider: "provider-a", id: "model-a", name: "Model A", reasoning: true },
		{ provider: "provider-a", id: "model-b", name: "Model B", reasoning: true },
	];
	const selections: Selection[] = [
		["Planner", "Change provider or model"],
		["Planner model", "model-b"],
		["Planner reasoning effort", "Medium"],
		["Executor", "Keep current"],
		["Step verifier", "Keep current"],
		["Final verifier", "Keep current"],
		["Repair fallback", "Keep current"],
		["Review Goala configuration", "Save configuration"],
	];
	const harness = setupContext(models, selections);
	const current = structuredClone(OPENAI_CODEX_PRESET);
	for (const role of [
		"planner",
		"executor",
		"stepVerifier",
		"verifier",
		"fallbackExecutor",
	] as const) {
		current[role].provider = "provider-a";
		current[role].model = "model-a";
	}

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.ok(configured);
	harness.assertComplete();
	assert.equal(configured.planner.model, "model-b");
	assert.ok(
		harness.seenTitles.every((title) => !title.includes(" provider\n")),
	);
});

test("setup cancellation returns no partial configuration", async () => {
	const models = [
		{ provider: "provider-a", id: "model-a", name: "Model A", reasoning: true },
	];
	const selections: Selection[] = [
		["Planner", "Keep current"],
		["Executor", "Keep current"],
		["Step verifier", "Keep current"],
		["Final verifier", "Keep current"],
		["Repair fallback", "Keep current"],
		["Review Goala configuration", "Cancel"],
	];
	const harness = setupContext(models, selections);
	const current = structuredClone(OPENAI_CODEX_PRESET);
	for (const role of [
		"planner",
		"executor",
		"stepVerifier",
		"verifier",
		"fallbackExecutor",
	] as const) {
		current[role].provider = "provider-a";
		current[role].model = "model-a";
	}
	const before = structuredClone(current);

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.equal(configured, undefined);
	harness.assertComplete();
	assert.deepEqual(current, before);
});
