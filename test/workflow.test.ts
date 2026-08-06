import assert from "node:assert/strict";
import test from "node:test";
import {
	normalizeState,
	verificationValidationError,
} from "../extensions/goala/workflow.ts";

test("normalizes legacy and malformed workflow state without trusting persisted shapes", () => {
	const state = normalizeState({
		version: 2,
		goalId: "goal-1",
		objective: "Preserve a legacy goal",
		phase: "not-a-phase",
		reviewPolicy: "not-a-policy",
		acceptanceCriteria: ["valid", 42],
		risks: null,
		repairCycles: -3,
		plan: [
			{
				id: 1,
				title: "Valid step",
				description: "Keep it.",
				verification: "Check it.",
				status: "done",
			},
			{ title: 42, description: "bad", verification: "bad" },
		],
	});

	assert.equal(state.version, 5);
	assert.deepEqual(state.memoryContext.references, []);
	assert.equal(state.phase, "idle");
	assert.equal(state.reviewPolicy, "final");
	assert.deepEqual(state.acceptanceCriteria, ["valid"]);
	assert.deepEqual(state.risks, []);
	assert.equal(state.repairCycles, 0);
	assert.equal(state.plan.length, 1);
	assert.equal(state.plan[0].status, "done");
});

test("verification validation requires concrete evidence and coherent verdicts", () => {
	assert.match(
		verificationValidationError(
			"pass",
			"Looks good.",
			[{ name: "tests", status: "pass", evidence: "" }],
			[],
		) ?? "",
		/concrete evidence/,
	);
	assert.match(
		verificationValidationError(
			"pass",
			"Looks good.",
			[{ name: "tests", status: "fail", evidence: "One failed." }],
			[],
		) ?? "",
		/PASS rejected/,
	);
	assert.equal(
		verificationValidationError(
			"pass",
			"All checks passed.",
			[{ name: "tests", status: "pass", evidence: "8/8 passed." }],
			[],
		),
		undefined,
	);
});
