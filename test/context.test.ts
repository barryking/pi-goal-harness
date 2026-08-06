import assert from "node:assert/strict";
import test from "node:test";
import { buildPhaseContext } from "../extensions/goala/context.ts";

const memory = {
	storeId: "store-1",
	storeName: "fixture",
	storeScope: "repository" as const,
	commit: "b".repeat(40),
	path: "rules/window.md",
	sha256: "a".repeat(64),
	authority: "advisory" as const,
	excerpt: "Range is 1..3600",
	content: "Use strict parsing. The supported range is 1..3600.",
};

const plan = Array.from({ length: 8 }, (_, index) => ({
	id: index + 1,
	title: `Step ${index + 1}`,
	description: `Description ${index + 1}`,
	verification: `Check ${index + 1}`,
	status: (index < 5 ? "done" : "pending") as "done" | "pending",
	evidence: `Completed evidence ${index + 1}`,
}));

test("execution receives remaining work and selected guidance, not completed evidence", () => {
	const packet = buildPhaseContext(
		{
			objective: "Harden window parsing",
			acceptanceCriteria: ["Public and hidden checks pass"],
			phase: "executing",
			plan,
			memoryContext: { status: "available", references: [memory] },
		},
	);

	assert.ok(packet.includes("Step 6"));
	assert.ok(!packet.includes("Step 1\n"));
	assert.ok(!packet.includes("Completed evidence"));
	assert.ok(packet.includes(memory.path));
	assert.ok(packet.includes(memory.content));
});

test("verification receives binding guidance but excludes advisory guidance", () => {
	const binding = { ...memory, path: "rules/binding.md", authority: "binding" as const };
	const packet = buildPhaseContext(
		{
			objective: "Harden window parsing",
			acceptanceCriteria: ["Public and hidden checks pass"],
			phase: "verifying",
			plan,
			memoryContext: { status: "available", references: [memory, binding] },
		},
	);

	assert.ok(packet.includes("Public and hidden checks pass"));
	assert.ok(packet.includes("TRUST BOUNDARY"));
	assert.ok(!packet.includes(memory.path));
	assert.ok(packet.includes(binding.path));
	assert.ok(!packet.includes("Completed evidence"));
});
