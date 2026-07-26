import assert from "node:assert/strict";
import test from "node:test";
import {
	enforceToolPolicy,
	isReadOnlyCommand,
} from "../extensions/goal-harness/policy.ts";

const nonInteractiveContext = {
	hasUI: false,
	ui: {
		confirm: async () => false,
	},
};

test("classifies simple inspection commands without trusting shell composition", () => {
	assert.equal(isReadOnlyCommand("git status --short"), true);
	assert.equal(isReadOnlyCommand("rg TODO src"), true);
	assert.equal(isReadOnlyCommand("cat package.json | tee copy.json"), false);
	assert.equal(isReadOnlyCommand("git status; rm result.txt"), false);
});

test("keeps planning and verification non-editing", async () => {
	assert.deepEqual(
		await enforceToolPolicy(
			"planning",
			{ toolName: "write", input: {} },
			nonInteractiveContext,
		),
		{ block: true, reason: "planning mode does not permit file edits." },
	);
	assert.match(
		(
			await enforceToolPolicy(
				"verifying",
				{ toolName: "bash", input: { command: "npm install left-pad" } },
				nonInteractiveContext,
			)
		)?.reason ?? "",
		/must remain non-editing/,
	);
});

test("requires explicit interactive approval for high-risk execution commands", async () => {
	const command = "git push origin main";
	assert.match(
		(
			await enforceToolPolicy(
				"executing",
				{ toolName: "bash", input: { command } },
				nonInteractiveContext,
			)
		)?.reason ?? "",
		/requires interactive confirmation/,
	);

	let prompted = false;
	const allowed = await enforceToolPolicy(
		"executing",
		{ toolName: "bash", input: { command } },
		{
			hasUI: true,
			ui: {
				confirm: async () => {
					prompted = true;
					return true;
				},
			},
		},
	);
	assert.equal(prompted, true);
	assert.equal(allowed, undefined);
});
