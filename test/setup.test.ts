import assert from "node:assert/strict";
import test from "node:test";
import { OPENAI_CODEX_PRESET } from "../extensions/goala/config.ts";
import { selectModelRoles } from "../extensions/goala/setup.ts";

test("interactive setup selects an available provider, model, and reasoning level per role", async () => {
	const models = [
		{ provider: "provider-a", id: "planner", name: "Planner", reasoning: true },
		{ provider: "provider-b", id: "executor", name: "Executor", reasoning: true },
		{ provider: "provider-c", id: "step", name: "Step", reasoning: true },
		{ provider: "provider-d", id: "verifier", name: "Verifier", reasoning: true },
		{ provider: "provider-e", id: "repair", name: "Repair", reasoning: false },
	];
	const roleModels = new Map([
		["Planner", "provider-a/planner"],
		["Executor", "provider-b/executor"],
		["Step verifier", "provider-c/step"],
		["Final verifier", "provider-d/verifier"],
		["Repair fallback", "provider-e/repair"],
	]);
	const roleThinking = new Map([
		["Planner", "high"],
		["Executor", "low"],
		["Step verifier", "medium"],
		["Final verifier", "xhigh"],
	]);
	let refreshes = 0;

	const ctx = {
		hasUI: true,
		modelRegistry: {
			async refresh() {
				refreshes += 1;
			},
			getAvailable: () => models,
			getProviderDisplayName: (provider: string) => provider.toUpperCase(),
		},
		ui: {
			notify() {},
			async select(title: string, options: string[]) {
				const role = [...roleModels.keys()].find((label) => title.startsWith(label));
				assert.ok(role);
				if (title.includes(" model")) {
					const identity = roleModels.get(role);
					return options.find((option) => option.includes(identity!));
				}
				return roleThinking.get(role);
			},
		},
	};

	const current = structuredClone(OPENAI_CODEX_PRESET);
	current.fallbackExecutor.afterRepairCycle = 4;
	const configured = await selectModelRoles(ctx as never, current);

	assert.ok(configured);
	assert.equal(refreshes, 1);
	assert.deepEqual(configured.planner, {
		provider: "provider-a",
		model: "planner",
		thinkingLevel: "high",
	});
	assert.deepEqual(configured.executor, {
		provider: "provider-b",
		model: "executor",
		thinkingLevel: "low",
	});
	assert.deepEqual(configured.stepVerifier, {
		provider: "provider-c",
		model: "step",
		thinkingLevel: "medium",
	});
	assert.deepEqual(configured.verifier, {
		provider: "provider-d",
		model: "verifier",
		thinkingLevel: "xhigh",
	});
	assert.deepEqual(configured.fallbackExecutor, {
		provider: "provider-e",
		model: "repair",
		thinkingLevel: "off",
		afterRepairCycle: 4,
	});
});
