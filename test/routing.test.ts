import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	OPENAI_CODEX_PRESET,
	writeConfig,
	type GoalaConfig,
	type ModelProfile,
} from "../extensions/goala/config.ts";
import goala from "../extensions/goala/index.ts";
import { modelProfileForPhase } from "../extensions/goala/routing.ts";
import {
	emptyState,
	GOAL_STATE_ENTRY,
	type Phase,
} from "../extensions/goala/workflow.ts";

function profile(
	provider: string,
	model: string,
	thinkingLevel: ModelProfile["thinkingLevel"],
): ModelProfile {
	return { provider, model, thinkingLevel };
}

const config: GoalaConfig = {
	...structuredClone(OPENAI_CODEX_PRESET),
	planner: profile("planning-provider", "planning-model", "high"),
	executor: profile("execution-provider", "execution-model", "low"),
	stepVerifier: profile("step-provider", "step-model", "medium"),
	verifier: profile("verification-provider", "verification-model", "xhigh"),
	fallbackExecutor: {
		...profile("fallback-provider", "fallback-model", "minimal"),
		afterRepairCycle: 2,
	},
};

const cases: Array<{
	name: string;
	phase: Phase;
	repairCycles: number;
	expected: ModelProfile;
}> = [
	{
		name: "planning uses the planner",
		phase: "planning",
		repairCycles: 0,
		expected: config.planner,
	},
	{
		name: "awaiting execution keeps the planner",
		phase: "awaiting-execution",
		repairCycles: 0,
		expected: config.planner,
	},
	{
		name: "review discussion keeps the planner",
		phase: "awaiting-review",
		repairCycles: 0,
		expected: config.planner,
	},
	{
		name: "ordinary execution uses the executor",
		phase: "executing",
		repairCycles: 0,
		expected: config.executor,
	},
	{
		name: "the first repair still uses the executor",
		phase: "executing",
		repairCycles: 1,
		expected: config.executor,
	},
	{
		name: "step verification uses the step verifier",
		phase: "verifying-step",
		repairCycles: 0,
		expected: config.stepVerifier,
	},
	{
		name: "final verification uses the final verifier",
		phase: "verifying",
		repairCycles: 0,
		expected: config.verifier,
	},
	{
		name: "the configured threshold activates the fallback executor",
		phase: "executing",
		repairCycles: 2,
		expected: config.fallbackExecutor,
	},
	{
		name: "later repairs continue using the fallback executor",
		phase: "executing",
		repairCycles: 3,
		expected: config.fallbackExecutor,
	},
];

for (const routingCase of cases) {
	test(routingCase.name, () => {
		assert.deepEqual(
			modelProfileForPhase(
				config,
				routingCase.phase,
				routingCase.repairCycles,
			),
			routingCase.expected,
		);
	});
}

test("the extension applies each routed model and reasoning level to Pi", async () => {
	for (const routingCase of cases.filter(
		(candidate) =>
			[
				"planning",
				"executing",
				"verifying-step",
				"verifying",
			].includes(candidate.phase),
	)) {
		process.env.PI_GOALA_HOME = mkdtempSync(
			join(tmpdir(), "pi-goala-routing-"),
		);
		writeConfig(config);

		const handlers = new Map<
			string,
			Array<(event: unknown, ctx: any) => unknown>
		>();
		const registeredTools: string[] = [];
		let selectedModel: { provider: string; id: string } | undefined;
		let selectedThinking: string | undefined;
		const pi = {
			on(name: string, handler: (event: unknown, ctx: any) => unknown) {
				const registered = handlers.get(name) ?? [];
				registered.push(handler);
				handlers.set(name, registered);
			},
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
			registerCommand() {},
			registerEntryRenderer() {},
			getActiveTools: () => ["read", "bash", "edit", "write"],
			getAllTools: () =>
				["read", "bash", "edit", "write", ...registeredTools].map(
					(name) => ({ name }),
				),
			setActiveTools() {},
			async setModel(model: { provider: string; id: string }) {
				selectedModel = model;
				return true;
			},
			setThinkingLevel(level: string) {
				selectedThinking = level;
			},
			appendEntry() {},
			setSessionName() {},
			sendUserMessage() {},
			sendMessage() {},
		};
		goala(pi as never);

		const state = {
			...emptyState(),
			goalId: "routing-goal",
			objective: "Verify model routing",
			phase: routingCase.phase,
			repairCycles: routingCase.repairCycles,
		};
		const ctx = {
			mode: "print",
			hasUI: false,
			cwd: process.cwd(),
			model: { provider: "session-provider", id: "session-model" },
			thinkingLevel: "off",
			modelRegistry: {
				find(provider: string, id: string) {
					return { provider, id };
				},
			},
			sessionManager: {
				getBranch: () => [{
					type: "custom",
					customType: GOAL_STATE_ENTRY,
					data: state,
				}],
				getSessionFile: () => undefined,
			},
			ui: {
				setStatus() {},
				setWidget() {},
				notify() {},
			},
			isIdle: () => true,
		};

		for (const handler of handlers.get("session_start") ?? []) {
			await handler({}, ctx);
		}

		assert.deepEqual(
			selectedModel,
			{
				provider: routingCase.expected.provider,
				id: routingCase.expected.model,
			},
			routingCase.name,
		);
		assert.equal(
			selectedThinking,
			routingCase.expected.thinkingLevel,
			routingCase.name,
		);
	}
});
