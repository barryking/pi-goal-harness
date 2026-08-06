import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import goala, {
	formatPlanForReview,
} from "../extensions/goala/index.ts";

test("formats the complete structured plan for approval", () => {
	const content = formatPlanForReview({
		objective: "Build a local-only todo app",
		phase: "awaiting-execution",
		reviewPolicy: "per-step",
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
	assert.match(content, /Review policy: per-step/);
	assert.match(content, /Visual quality is subjective/);
	assert.match(content, /Implement typed state transitions/);
	assert.match(content, /Verify: Run domain and persistence tests/);
	assert.match(content, /Run \/execute to approve this plan/);
});

test("submitting and reopening a plan emits a rendered TUI-only entry", async () => {
	process.env.PI_GOALA_HOME = mkdtempSync(
		join(tmpdir(), "pi-goala-plan-presentation-"),
	);
	process.env.PI_DREAM_HOME = join(
		mkdtempSync(join(tmpdir(), "pi-goala-plan-dream-")),
		"not-initialized",
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

	goala(pi as never);

	const model = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const projectDir = mkdtempSync(join(tmpdir(), "pi-goala-plan-repo-"));
	mkdirSync(join(projectDir, "docs"));
	const prdContent = "# Todo requirements\nTodos must persist locally.\n";
	writeFileSync(
		join(projectDir, "docs", "PRD.md"),
		prdContent,
	);
	const ctx = {
		mode: "print",
		hasUI: false,
		cwd: projectDir,
		model,
		thinkingLevel: "medium",
		modelRegistry: {
			find(provider: string, id: string) {
				return { provider, id };
			},
		},
		sessionManager: {
			getBranch: () => [],
			getSessionDir: () => join(projectDir, "sessions"),
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

	await commands.get("goal-status")?.handler("", ctx);
	const statusEntries = entries.filter(
		(entry) => entry.customType === "goala-status",
	);
	assert.equal(statusEntries.length, 1);
	assert.match(statusEntries[0].data.content, /No active goal in this Pi session/);
	assert.equal(messages.length, 0, "TUI-only status must not enter model context");

	await commands.get("goal-plan")?.handler("", ctx);
	assert.match(notifications.at(-1)?.message ?? "", /There is no active goal/);
	notifications.length = 0;

	await commands.get("goal")?.handler(
		"--source docs/PRD.md -- Build a local-only todo app",
		ctx,
	);
	const sourceState = entries
		.filter((entry) => entry.customType === "goala-state")
		.at(-1)?.data;
	assert.equal(sourceState.sources.length, 1);
	assert.equal(sourceState.sources[0].path, "docs/PRD.md");
	assert.match(sourceState.sources[0].sha256, /^[a-f0-9]{64}$/);
	await commands.get("goal")?.handler("context", ctx);
	const contextEntry = entries.filter(
		(entry) => entry.customType === "goala-context",
	).at(-1);
	assert.ok(contextEntry);
	assert.match(contextEntry.data.content, /Dream guidance for this Goal/);
	assert.equal(notifications.length, 0, "goal context should not use a grey info notification");
	const contextRenderer = entryRenderers.get("goala-context");
	assert.equal(typeof contextRenderer, "function");
	const contextColors: string[] = [];
	const contextComponent = contextRenderer(
		{ data: contextEntry.data },
		{ expanded: false, outputPad: 0 },
		{
			fg: (color: string, text: string) => {
				contextColors.push(color);
				return text;
			},
		},
	);
	assert.match(contextComponent.render(120).join("\n"), /Goala works normally without Dream guidance/);
	assert.ok(contextColors.includes("accent"));
	assert.ok(contextColors.includes("text"));
	await commands.get("goal-plan")?.handler("", ctx);
	assert.match(notifications.at(-1)?.message ?? "", /does not have a submitted plan yet/);
	notifications.length = 0;

	const planSubmission = {
		acceptanceCriteria: ["Todos persist locally across reloads."],
		risks: ["Visual quality is subjective."],
		steps: [
			{
				title: "Build the todo domain",
				description: "Implement typed state transitions and browser persistence.",
				verification: "Run domain and persistence tests.",
			},
		],
	};
	writeFileSync(join(projectDir, "docs", "PRD.md"), `${prdContent}\nChanged contract.\n`);
	const rejected = await tools.get("submit_plan").execute(
		"plan-call",
		planSubmission,
		new AbortController().signal,
		() => {},
		ctx,
	);
	assert.equal(rejected.details.accepted, false);
	assert.match(rejected.content[0].text, /authoritative goal contract changed/);

	writeFileSync(join(projectDir, "docs", "PRD.md"), prdContent);
	const result = await tools.get("submit_plan").execute(
		"plan-call",
		planSubmission,
		new AbortController().signal,
		() => {},
		ctx,
	);

	assert.equal(result.details.accepted, true);
	const submittedPlans = entries.filter(
		(entry) => entry.customType === "goala-plan",
	);
	assert.equal(submittedPlans.length, 1);
	assert.match(submittedPlans[0].data.content, /Authoritative sources \(1\)/);
	assert.match(submittedPlans[0].data.content, /docs\/PRD\.md/);
	assert.match(submittedPlans[0].data.content, /Acceptance criteria \(1\)/);
	assert.match(submittedPlans[0].data.content, /Run \/execute to approve this plan/);
	assert.equal(messages.length, 0, "TUI-only plans must not enter model context");

	await commands.get("goal-plan")?.handler("", ctx);
	const reopenedPlans = entries.filter(
		(entry) => entry.customType === "goala-plan",
	);
	assert.equal(reopenedPlans.length, 2);
	assert.match(reopenedPlans[1].data.content, /Implement typed state transitions/);
	assert.equal(messages.length, 0, "reopening a plan must not enter model context");
	assert.equal(notifications.length, 0);

	const renderer = entryRenderers.get("goala-plan");
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
