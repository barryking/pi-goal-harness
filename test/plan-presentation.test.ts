import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import goalHarness, {
	formatPlanForReview,
} from "../extensions/goal-harness/index.ts";

test("formats the complete structured plan for approval", () => {
	const content = formatPlanForReview({
		objective: "Build a local-only todo app",
		phase: "awaiting-execution",
		acceptanceCriteria: [
			"Todos persist locally across reloads.",
			"Keyboard flows and automated tests pass.",
		],
		risks: ["Visual quality is subjective."],
		plan: [
			{
				id: 1,
				title: "Build the todo domain",
				description: "Implement typed state transitions and browser persistence.",
				verification: "Run domain and persistence tests.",
				status: "pending",
			},
		],
	});

	assert.match(content, /Acceptance criteria \(2\)/);
	assert.match(content, /Todos persist locally across reloads/);
	assert.match(content, /Risks and assumptions \(1\)/);
	assert.match(content, /Visual quality is subjective/);
	assert.match(content, /Implement typed state transitions/);
	assert.match(content, /Verify: Run domain and persistence tests/);
	assert.match(content, /Run \/execute to approve this plan/);
});

test("submitting and reopening a plan emits a rendered TUI-only entry", async () => {
	process.env.PI_GOAL_HARNESS_HOME = mkdtempSync(
		join(tmpdir(), "pi-goal-harness-plan-presentation-"),
	);

	const commands = new Map<string, { handler: (args: string, ctx: any) => unknown }>();
	const tools = new Map<string, any>();
	const entryRenderers = new Map<string, any>();
	const entries: Array<{ customType: string; data: any }> = [];
	const messages: any[] = [];
	const notifications: Array<{ message: string; type: string }> = [];
	const registeredTools: string[] = [];
	let activeTools = ["read", "bash", "edit", "write"];

	const pi = {
		on() {},
		registerTool(tool: { name: string }) {
			registeredTools.push(tool.name);
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, command: { handler: (args: string, ctx: any) => unknown }) {
			commands.set(name, command);
		},
		registerEntryRenderer(customType: string, renderer: any) {
			entryRenderers.set(customType, renderer);
		},
		getActiveTools() {
			return [...activeTools];
		},
		getAllTools() {
			return [...activeTools, ...registeredTools].map((name) => ({ name }));
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
		sendUserMessage() {},
		sendMessage(message: any, options: any) {
			messages.push({ message, options });
		},
	};

	goalHarness(pi as never);

	const model = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const ctx = {
		mode: "print",
		hasUI: false,
		cwd: mkdtempSync(join(tmpdir(), "pi-goal-harness-plan-repo-")),
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
			notify(message: string, type: string) {
				notifications.push({ message, type });
			},
		},
		isIdle: () => true,
	};

	await commands.get("goal")?.handler("Build a local-only todo app", ctx);
	const result = await tools.get("submit_plan").execute(
		"plan-call",
		{
			acceptanceCriteria: ["Todos persist locally across reloads."],
			risks: ["Visual quality is subjective."],
			steps: [
				{
					title: "Build the todo domain",
					description: "Implement typed state transitions and browser persistence.",
					verification: "Run domain and persistence tests.",
				},
			],
		},
		new AbortController().signal,
		() => {},
		ctx,
	);

	assert.equal(result.details.accepted, true);
	const submittedPlans = entries.filter(
		(entry) => entry.customType === "goal-harness-plan",
	);
	assert.equal(submittedPlans.length, 1);
	assert.match(submittedPlans[0].data.content, /Acceptance criteria \(1\)/);
	assert.match(submittedPlans[0].data.content, /Run \/execute to approve this plan/);
	assert.equal(messages.length, 0, "TUI-only plans must not enter model context");

	await commands.get("goal-plan")?.handler("", ctx);
	const reopenedPlans = entries.filter(
		(entry) => entry.customType === "goal-harness-plan",
	);
	assert.equal(reopenedPlans.length, 2);
	assert.match(reopenedPlans[1].data.content, /Implement typed state transitions/);
	assert.equal(messages.length, 0, "reopening a plan must not enter model context");
	assert.equal(notifications.length, 0);

	const renderer = entryRenderers.get("goal-harness-plan");
	assert.equal(typeof renderer, "function");
	const component = renderer(
		{ data: reopenedPlans[1].data },
		{ expanded: false, outputPad: 0 },
		{ fg: (_color: string, text: string) => text },
	);
	const rendered = component.render(120).join("\n");
	assert.match(rendered.trimStart(), /^Goal plan/);
	assert.match(rendered, /Acceptance criteria \(1\)/);
	assert.match(rendered, /Verify: Run domain and persistence tests/);
});
