import assert from "node:assert/strict";
import test from "node:test";
import { fixedModelConfig, PI_DEFAULT_CONFIG } from "../extensions/goala/config.ts";
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
		{
			provider: "provider-b",
			id: "model-b",
			name: "Model B",
			reasoning: true,
			thinkingLevelMap: { xhigh: "xhigh" },
		},
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
		["Fallback executor", "Change provider or model"],
		["Fallback executor provider", "provider-b"],
		["Fallback executor model", "plain"],
		["Review Goala configuration", "Edit a role"],
		["Choose a role to edit", "Planner"],
		["Planner", "Change reasoning effort"],
		["Planner reasoning effort", "Low"],
		["Review Goala configuration", "Save configuration"],
	];
	const harness = setupContext(models, selections);
	const current = fixedModelConfig("provider-a", "model-a", "medium");
	current.fallbackExecutor.afterRepairCycle = 4;

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.ok(configured);
	assert.equal(harness.refreshes(), 1);
	harness.assertComplete();
	assert.equal(configured.planner.kind, "fixed");
	assert.equal(configured.executor.kind, "fixed");
	if (configured.planner.kind === "fixed") {
		assert.equal(configured.planner.thinkingLevel, "low");
	}
	if (configured.executor.kind === "fixed") {
		assert.equal(configured.executor.thinkingLevel, "high");
	}
	assert.deepEqual(configured.stepVerifier, {
		kind: "fixed",
		provider: "provider-b",
		model: "model-b",
		thinkingLevel: "xhigh",
	});
	assert.deepEqual(configured.fallbackExecutor, {
		kind: "fixed",
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
		["Fallback executor", "Keep current"],
		["Review Goala configuration", "Save configuration"],
	];
	const harness = setupContext(models, selections);
	const current = fixedModelConfig("provider-a", "model-a");

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.ok(configured);
	harness.assertComplete();
	assert.equal(configured.planner.kind, "fixed");
	if (configured.planner.kind === "fixed") {
		assert.equal(configured.planner.model, "model-b");
	}
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
		["Fallback executor", "Keep current"],
		["Review Goala configuration", "Cancel"],
	];
	const harness = setupContext(models, selections);
	const current = fixedModelConfig("provider-a", "model-a");
	const before = structuredClone(current);

	const configured = await selectModelRoles(harness.ctx as never, current);

	assert.equal(configured, undefined);
	harness.assertComplete();
	assert.deepEqual(current, before);
});

test("dynamic defaults remain unpinned until a role is explicitly changed", async () => {
	const models = [
		{
			provider: "provider-a",
			id: "model-a",
			name: "Model A",
			reasoning: true,
			thinkingLevelMap: { minimal: null, xhigh: null, max: null },
		},
	];
	const selections: Selection[] = [
		["Planner", "Change provider or model"],
		["Planner model", "model-a"],
		["Planner reasoning effort", "Low"],
		["Executor", "Keep current"],
		["Step verifier", "Keep current"],
		["Final verifier", "Keep current"],
		["Fallback executor", "Keep current"],
		["Review Goala configuration", "Save configuration"],
	];
	const harness = setupContext(models, selections);
	const ctx = {
		...harness.ctx,
		model: models[0],
		thinkingLevel: "minimal",
	};

	const configured = await selectModelRoles(
		ctx as never,
		structuredClone(PI_DEFAULT_CONFIG),
	);

	assert.ok(configured);
	harness.assertComplete();
	assert.deepEqual(configured.planner, {
		kind: "fixed",
		provider: "provider-a",
		model: "model-a",
		thinkingLevel: "low",
	});
	assert.equal(configured.executor.kind, "pi-default");
	assert.equal(configured.stepVerifier.kind, "pi-default");
	assert.equal(configured.verifier.kind, "pi-default");
	assert.deepEqual(configured.fallbackExecutor, {
		kind: "pi-default",
		afterRepairCycle: PI_DEFAULT_CONFIG.fallbackExecutor.afterRepairCycle,
	});
});
