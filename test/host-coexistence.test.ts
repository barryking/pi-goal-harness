import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import goala from "../extensions/goala/index.ts";

process.env.PI_GOALA_HOME = mkdtempSync(
	join(tmpdir(), "pi-goala-coexistence-"),
);

test("idle installation preserves the host model, tools, and command policy", async () => {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const commands = new Set<string>();
	const registeredTools: string[] = [];
	const baseline = ["read", "bash", "edit", "write", "other-extension-tool"];
	let activeTools = [...baseline];
	let modelChanges = 0;
	let confirmations = 0;

	const pi = {
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerTool(tool: { name: string }) {
			registeredTools.push(tool.name);
		},
		registerCommand(name: string) {
			commands.add(name);
		},
		registerEntryRenderer() {},
		getActiveTools() {
			return [...activeTools];
		},
		getAllTools() {
			return [...baseline, ...registeredTools].map((name) => ({ name }));
		},
		setActiveTools(tools: string[]) {
			activeTools = [...tools];
		},
		async setModel() {
			modelChanges += 1;
			return true;
		},
		setThinkingLevel() {},
		appendEntry() {},
		setSessionName() {},
		sendUserMessage() {},
		sendMessage() {},
	};

	goala(pi as never);
	assert.ok(commands.has("goala-setup"));

	const model = { provider: "example", id: "chosen-model" };
	const ctx = {
		mode: "tui",
		hasUI: true,
		cwd: process.cwd(),
		model,
		thinkingLevel: "low",
		modelRegistry: {
			find(provider: string, id: string) {
				return provider === model.provider && id === model.id ? model : undefined;
			},
		},
		sessionManager: {
			getBranch: () => [],
			getSessionFile: () => undefined,
		},
		ui: {
			setStatus() {},
			setWidget() {},
			notify() {},
			async confirm() {
				confirmations += 1;
				return true;
			},
		},
		isIdle: () => true,
	};

	for (const handler of handlers.get("session_start") ?? []) {
		await handler({}, ctx);
	}

	assert.equal(modelChanges, 0);
	assert.deepEqual(activeTools, baseline);

	for (const handler of handlers.get("tool_call") ?? []) {
		const result = await handler(
			{ toolName: "bash", input: { command: "git push origin main" } },
			ctx,
		);
		assert.equal(result, undefined);
	}
	assert.equal(confirmations, 0);
});
