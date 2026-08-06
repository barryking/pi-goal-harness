import assert from "node:assert/strict";
import test from "node:test";
import {
	clampThinkingLevel,
	supportedThinkingLevels,
} from "../extensions/goala/model-capabilities.ts";

test("non-reasoning models only support reasoning off", () => {
	const model = { reasoning: false };
	assert.deepEqual(supportedThinkingLevels(model), ["off"]);
	assert.equal(clampThinkingLevel(model, "high"), "off");
});

test("models.json thinking maps control the available reasoning levels", () => {
	const model = {
		reasoning: true,
		thinkingLevelMap: {
			minimal: null,
			xhigh: "xhigh",
			max: null,
		},
	};
	assert.deepEqual(supportedThinkingLevels(model), [
		"off",
		"low",
		"medium",
		"high",
		"xhigh",
	]);
	assert.equal(clampThinkingLevel(model, "minimal"), "low");
	assert.equal(clampThinkingLevel(model, "max"), "xhigh");
});
