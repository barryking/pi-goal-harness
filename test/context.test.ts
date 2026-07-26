import assert from "node:assert/strict";
import test from "node:test";
import { buildPhaseContext } from "../extensions/goala/context.ts";
import type { MemoryConfig } from "../extensions/goala/memory.ts";

const memoryConfig: MemoryConfig = {
	enabled: true,
	autoRecall: true,
	maxResults: 4,
	maxInjectedChars: 1600,
	maxResultChars: 400,
	storeColdEvidence: true,
};

const memory = {
	id: "mem-verified",
	repoKey: "local:fixture",
	objective: "Previous objective",
	intent: "Use strict parsing",
	outcome: "Hidden checks passed",
	learnings: ["Range is 1..3600"],
	openItems: [],
	files: ["src/window.js"],
	verifiedAt: "2026-07-25T00:00:00.000Z",
};

const plan = Array.from({ length: 8 }, (_, index) => ({
	id: index + 1,
	title: `Step ${index + 1}`,
	description: `Description ${index + 1}`,
	verification: `Check ${index + 1}`,
	status: (index < 5 ? "done" : "pending") as "done" | "pending",
	evidence: `Completed evidence ${index + 1}`,
}));

test("execution receives remaining work and bounded memory, not completed evidence", () => {
	const packet = buildPhaseContext(
		{
			objective: "Harden window parsing",
			acceptanceCriteria: ["Public and hidden checks pass"],
			phase: "executing",
			plan,
			recalledMemories: [memory],
		},
		memoryConfig,
	);

	assert.ok(packet.includes("Step 6"));
	assert.ok(!packet.includes("Step 1\n"));
	assert.ok(!packet.includes("Completed evidence"));
	assert.ok(packet.includes(memory.id));
});

test("verification receives criteria and a trust boundary, never recalled memory", () => {
	const packet = buildPhaseContext(
		{
			objective: "Harden window parsing",
			acceptanceCriteria: ["Public and hidden checks pass"],
			phase: "verifying",
			plan,
			recalledMemories: [memory],
		},
		memoryConfig,
	);

	assert.ok(packet.includes("Public and hidden checks pass"));
	assert.ok(packet.includes("TRUST BOUNDARY"));
	assert.ok(!packet.includes(memory.id));
	assert.ok(!packet.includes(memory.outcome));
	assert.ok(!packet.includes("Completed evidence"));
});
