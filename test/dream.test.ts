import assert from "node:assert/strict";
import test from "node:test";
import {
	DreamMemoryClient,
	MAX_GOAL_MEMORY_CHARS,
	formatGoalMemoryStatus,
	isMissingDreamInterop,
} from "../extensions/goala/dream.ts";

const reference = {
	storeId: "store-1",
	storeName: "Repository memory",
	storeScope: "repository" as const,
	commit: "b".repeat(40),
	path: "architecture/rules.md",
	sha256: "a".repeat(64),
};

test("uses Dream's generic reader and captures exact versioned documents", async () => {
	const calls: string[] = [];
	const reader = {
		async discover(cwd: string) {
			calls.push(`discover:${cwd}`);
			return {
				repositoryIdentity: "repo:fixture",
				stores: [{ storeId: reference.storeId, name: reference.storeName, scope: reference.storeScope, commit: reference.commit }],
			};
		},
		async search(_context: unknown, query: string) {
			calls.push(`search:${query}`);
			return [{ ...reference, excerpt: "Use the shared writer.", score: 0.9 }];
		},
		async read(input: typeof reference) {
			calls.push(`read:${input.commit}:${input.path}`);
			return { ...reference, content: "All writes use the shared writer." };
		},
	};
	const client = new DreamMemoryClient(async () => ({
		createMemoryReader: async () => reader,
	}));

	const discovery = await client.discover("/fixture", "add write-back");
	assert.equal(discovery.status, "available");
	assert.equal(discovery.repositoryIdentity, "repo:fixture");
	assert.equal(discovery.hits.length, 1);
	const captured = await client.capture([{ hit: discovery.hits[0], authority: "binding" }]);
	assert.equal(captured.warnings.length, 0);
	assert.equal(captured.references[0].content, "All writes use the shared writer.");
	assert.equal(captured.references[0].authority, "binding");
	assert.deepEqual(calls, [
		"discover:/fixture",
		"search:add write-back",
		`read:${reference.commit}:${reference.path}`,
	]);
	assert.match(formatGoalMemoryStatus({ status: "available", references: captured.references }), /Binding guidance/);
	assert.match(
		formatGoalMemoryStatus({ status: "available", references: captured.references }),
		/These documents stay fixed for this Goal/,
	);
});

test("missing Dream is optional but nested module failures are not hidden", async () => {
	const missing = Object.assign(
		new Error("Cannot find package 'pi-dream' imported from /tmp/goala/dream.ts"),
		{ code: "ERR_MODULE_NOT_FOUND" },
	);
	assert.equal(isMissingDreamInterop(missing), true);
	assert.equal(
		isMissingDreamInterop(Object.assign(new Error("Cannot find package 'other'"), { code: "ERR_MODULE_NOT_FOUND" })),
		false,
	);

	const client = new DreamMemoryClient(async () => undefined);
	const discovery = await client.discover("/fixture", "goal");
	assert.equal(discovery.status, "unavailable");
	assert.match(discovery.message ?? "", /continue without durable memory/i);
	assert.match(
		formatGoalMemoryStatus({ status: discovery.status, references: [], message: discovery.message }),
		/Dream guidance for this Goal/,
	);
});

test("oversized Dream documents are skipped instead of bloating Goal state", async () => {
	const hit = { ...reference, excerpt: "large", score: 0.5 };
	const client = new DreamMemoryClient(async () => ({
		createMemoryReader: async () => ({
			discover: async () => ({ repositoryIdentity: "repo", stores: [] }),
			search: async () => [hit],
			read: async () => ({ ...reference, content: "x".repeat(MAX_GOAL_MEMORY_CHARS + 1) }),
		}),
	}));
	await client.discover("/fixture", "goal");
	const captured = await client.capture([{ hit, authority: "advisory" }]);
	assert.deepEqual(captured.references, []);
	assert.match(captured.warnings[0], /limited to 64,000 characters/);
});
