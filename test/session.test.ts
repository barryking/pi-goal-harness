import assert from "node:assert/strict";
import test from "node:test";
import { slicePhaseContext } from "../extensions/goal-harness/session.ts";

test("starts provider context at the newest marker for the active phase", () => {
	const messages = [
		{ role: "user", content: "old planning discussion" },
		{ role: "assistant", content: "old answer" },
		{ role: "user", content: "[GOAL-HARNESS PHASE:EXECUTING]\nImplement step 1." },
		{ role: "assistant", content: [{ type: "text", text: "working" }] },
		{ role: "user", content: "[GOAL-HARNESS PHASE:EXECUTING]\nRepair the defect." },
		{ role: "assistant", content: "repairing" },
	];

	assert.deepEqual(slicePhaseContext(messages, "executing"), messages.slice(4));
});

test("supports structured text content and leaves unrelated phases untouched", () => {
	const messages = [
		{ role: "system", content: "bootstrap" },
		{
			role: "user",
			content: [
				{ type: "image", text: "ignored" },
				{ type: "text", text: "[GOAL-HARNESS PHASE:STEP-VERIFYING]" },
			],
		},
		{ role: "assistant", content: "checked" },
	];

	assert.deepEqual(slicePhaseContext(messages, "verifying-step"), messages.slice(1));
	assert.equal(slicePhaseContext(messages, "awaiting-review"), undefined);
	assert.equal(slicePhaseContext(messages, "planning"), undefined);
});
