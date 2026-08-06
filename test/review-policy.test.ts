import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import goala from "../extensions/goala/index.ts";

test("per-step review gates progress through independent final verification", async () => {
	process.env.PI_GOALA_HOME = mkdtempSync(
		join(tmpdir(), "pi-goala-review-policy-"),
	);

	const commands = new Map<string, { handler: (args: string, ctx: any) => unknown }>();
	const tools = new Map<string, any>();
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const entries: Array<{ customType: string; data: any }> = [];
	const messages: any[] = [];
	const notifications: string[] = [];
	const registeredTools: string[] = [];
	const baseline = ["read", "bash", "edit", "write", "grep", "find", "ls"];
	let activeTools = [...baseline];

	const pi = {
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			const registered = handlers.get(name) ?? [];
			registered.push(handler);
			handlers.set(name, registered);
		},
		registerTool(tool: { name: string }) {
			registeredTools.push(tool.name);
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, command: { handler: (args: string, ctx: any) => unknown }) {
			commands.set(name, command);
		},
		registerEntryRenderer() {},
		getActiveTools() {
			return [...activeTools];
		},
		getAllTools() {
			return [...baseline, ...registeredTools].map((name) => ({ name }));
		},
		setActiveTools(value: string[]) {
			activeTools = [...value];
		},
		async setModel() {
			return true;
		},
		setThinkingLevel() {},
		appendEntry(customType: string, data: any) {
			entries.push({ customType, data });
		},
		setSessionName() {},
		sendUserMessage(message: string, options?: unknown) {
			messages.push({ message, options });
		},
		sendMessage(message: unknown, options: unknown) {
			messages.push({ message, options });
		},
	};

	goala(pi as never);
	assert.ok(!registeredTools.some((name) => name.startsWith("memory")));

	const model = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const ctx = {
		mode: "print",
		hasUI: false,
		cwd: mkdtempSync(join(tmpdir(), "pi-goala-review-repo-")),
		model,
		thinkingLevel: "medium",
		modelRegistry: {
			find(provider: string, id: string) {
				return { provider, id };
			},
		},
		sessionManager: {
			getBranch: () => [],
			getSessionFile: () => undefined,
		},
		ui: {
			setStatus() {},
			setWidget() {},
			notify(message: string) {
				notifications.push(message);
			},
		},
		isIdle: () => true,
	};

	const latestState = () =>
		entries.filter((entry) => entry.customType === "goala-state").at(-1)?.data;
	const runAgentEnd = async () => {
		for (const handler of handlers.get("agent_end") ?? []) await handler({}, ctx);
	};

	await commands.get("goal")?.handler("Ship two reviewed milestones", ctx);
	await commands.get("goal")?.handler("context", ctx);
	assert.match(entries.at(-1)?.data.content ?? "", /Dream guidance for this Goal/);
	await tools.get("submit_plan").execute(
		"plan",
		{
			acceptanceCriteria: ["Both milestones work together."],
			risks: [],
			steps: [
				{ title: "First milestone", description: "Implement first.", verification: "Run first check." },
				{ title: "Second milestone", description: "Implement second.", verification: "Run second check." },
			],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	await commands.get("execute")?.handler("per-step", ctx);
	assert.equal(latestState().phase, "executing");
	assert.equal(latestState().reviewPolicy, "per-step");

	const firstCompletion = await tools.get("goal_progress").execute(
		"progress-1",
		{ action: "complete_step", stepId: 1, evidence: "First check passed." },
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(firstCompletion.terminate, true);
	assert.equal(latestState().phase, "awaiting-review");
	assert.equal(latestState().plan[0].status, "implemented");

	await runAgentEnd();
	assert.match(messages.at(-1).message.content, /Step ready for review/);
	await commands.get("plan")?.handler("", ctx);
	assert.equal(latestState().phase, "awaiting-review");
	await commands.get("goal")?.handler("Replace the active goal", ctx);
	assert.equal(latestState().objective, "Ship two reviewed milestones");
	await commands.get("verify")?.handler("", ctx);
	assert.equal(latestState().phase, "verifying-step");
	assert.match(messages.at(-1).message, /STEP-VERIFYING/);
	const evidenceRejected = await tools.get("submit_step_verification").execute(
		"verify-step-1-empty",
		{
			verdict: "pass",
			summary: "Looks good.",
			checks: [{ name: "first", status: "pass", evidence: "" }],
			defects: [],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(evidenceRejected.details.accepted, false);
	assert.equal(latestState().phase, "verifying-step");

	await tools.get("submit_step_verification").execute(
		"verify-step-1",
		{
			verdict: "pass",
			summary: "First milestone independently passed.",
			checks: [{ name: "first", status: "pass", evidence: "Observed pass." }],
			defects: [],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(latestState().phase, "awaiting-review");
	assert.equal(latestState().plan[0].status, "verified");

	for (const handler of handlers.get("tool_call") ?? []) {
		const blocked = await handler(
			{ toolName: "bash", input: { command: "touch should-not-run" } },
			ctx,
		) as { block?: boolean } | undefined;
		assert.equal(blocked?.block, true);
		const composed = await handler(
			{ toolName: "bash", input: { command: "cat README.md | sh" } },
			ctx,
		) as { block?: boolean } | undefined;
		assert.equal(composed?.block, true);
	}

	await runAgentEnd();
	await commands.get("goal")?.handler("pause", ctx);
	assert.equal(latestState().phase, "paused");
	await commands.get("goal")?.handler("resume", ctx);
	assert.equal(latestState().phase, "awaiting-review");
	await commands.get("goal")?.handler("revise Tighten the first milestone.", ctx);
	assert.equal(latestState().phase, "executing");
	assert.equal(latestState().plan[0].status, "pending");
	assert.match(messages.at(-1).message, /Tighten the first milestone/);

	await tools.get("goal_progress").execute(
		"progress-1-revised",
		{ action: "complete_step", stepId: 1, evidence: "Revised first check passed." },
		new AbortController().signal,
		() => {},
		ctx,
	);
	await runAgentEnd();
	await commands.get("verify")?.handler("", ctx);
	await tools.get("submit_step_verification").execute(
		"verify-step-1-revised",
		{
			verdict: "pass",
			summary: "Revised first milestone independently passed.",
			checks: [{ name: "first-revised", status: "pass", evidence: "Observed pass." }],
			defects: [],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	await runAgentEnd();
	await commands.get("goal")?.handler("approve", ctx);
	assert.equal(latestState().phase, "executing");
	assert.equal(latestState().plan[0].status, "done");

	await tools.get("goal_progress").execute(
		"progress-2",
		{ action: "complete_step", stepId: 2, evidence: "Second check passed." },
		new AbortController().signal,
		() => {},
		ctx,
	);
	await runAgentEnd();
	await commands.get("goal")?.handler("approve", ctx);
	assert.equal(latestState().phase, "verifying");
	assert.deepEqual(latestState().plan.map((step: any) => step.status), ["done", "done"]);

	await tools.get("submit_verification").execute(
		"verify-final-fail",
		{
			verdict: "fail",
			summary: "Integration needs one repair.",
			checks: [{ name: "integrated", status: "fail", evidence: "Observed mismatch." }],
			defects: ["Repair the integration mismatch."],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(latestState().phase, "executing");
	await runAgentEnd();

	const repaired = await tools.get("goal_progress").execute(
		"repair-ready",
		{ action: "ready_for_verification", evidence: "Integration repaired." },
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(repaired.details.accepted, true);
	await runAgentEnd();

	const finalResult = await tools.get("submit_verification").execute(
		"verify-final-pass",
		{
			verdict: "pass",
			summary: "The integrated goal passed.",
			checks: [{ name: "integrated", status: "pass", evidence: "Observed pass." }],
			defects: [],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(latestState().phase, "complete");
	assert.equal(finalResult.details.accepted, true);
	assert.equal("memory" in finalResult.details, false);
	assert.ok(notifications.some((message) => /resumed at the human review checkpoint/i.test(message)));
});
