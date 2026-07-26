import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPhaseContext } from "../extensions/goala/context.ts";
import type { MemoryConfig } from "../extensions/goala/memory.ts";
import {
	MAX_GOAL_SOURCE_BYTES,
	formatSourceDrift,
	inspectGoalSources,
	parseGoalRequest,
	resolveGoalSources,
} from "../extensions/goala/sources.ts";

const memoryConfig: MemoryConfig = {
	enabled: true,
	autoRecall: true,
	maxResults: 4,
	maxInjectedChars: 1600,
	maxResultChars: 400,
	storeColdEvidence: false,
};

test("parses repeated and quoted source paths without changing ordinary goals", () => {
	assert.deepEqual(parseGoalRequest("Build the import flow"), {
		objective: "Build the import flow",
		sourcePaths: [],
	});
	assert.deepEqual(parseGoalRequest("--source-control improvements"), {
		objective: "--source-control improvements",
		sourcePaths: [],
	});
	assert.deepEqual(
		parseGoalRequest(
			'--source "docs/Product Requirements.md" --source=docs/architecture.md -- Build the import flow',
		),
		{
			objective: "Build the import flow",
			sourcePaths: ["docs/Product Requirements.md", "docs/architecture.md"],
		},
	);
	assert.deepEqual(
		parseGoalRequest('--source "docs/before -- after.md" -- Build it'),
		{
			objective: "Build it",
			sourcePaths: ["docs/before -- after.md"],
		},
	);
	assert.throws(
		() => parseGoalRequest("--source docs/PRD.md Build it"),
		/require `--`/,
	);
});

test("captures bounded project-local UTF-8 sources with content hashes", () => {
	const project = mkdtempSync(join(tmpdir(), "pi-goal-sources-"));
	mkdirSync(join(project, "docs"));
	writeFileSync(join(project, "docs", "PRD.md"), "# Requirement\nExport must work offline.\n");

	const sources = resolveGoalSources(project, ["docs/PRD.md", "docs/PRD.md"]);
	assert.equal(sources.length, 1);
	assert.equal(sources[0].path, "docs/PRD.md");
	assert.match(sources[0].sha256, /^[a-f0-9]{64}$/);
	assert.equal(sources[0].bytes, 40);
	assert.deepEqual(inspectGoalSources(project, sources), []);
	writeFileSync(join(project, "docs", "PRD.md"), "# Changed requirement\n");
	const drift = inspectGoalSources(project, sources);
	assert.equal(drift[0].status, "changed");
	assert.match(formatSourceDrift(drift), /AUTHORITATIVE SOURCE DRIFT/);
	assert.match(formatSourceDrift(drift), /Stop and surface this discrepancy/);

	const outside = join(project, "..", "outside-prd.md");
	writeFileSync(outside, "outside");
	assert.throws(
		() => resolveGoalSources(project, [outside]),
		/must be files inside the current project/,
	);

	writeFileSync(join(project, "too-large.md"), "x".repeat(MAX_GOAL_SOURCE_BYTES + 1));
	assert.throws(
		() => resolveGoalSources(project, ["too-large.md"]),
		/exceeds 1,000,000 bytes/,
	);
});

test("all active phases receive bounded source references without copied PRD content", () => {
	const source = {
		path: "docs/PRD.md",
		sha256: "a".repeat(64),
		bytes: 48_000,
	};
	const baseState = {
		objective: "Build offline export",
		sources: [source],
		acceptanceCriteria: ["Export works offline"],
		plan: [{
			id: 1,
			title: "Implement export",
			description: "Add the export flow.",
			verification: "Run export tests.",
			status: "pending" as const,
		}],
		recalledMemories: [],
	};

	for (const phase of ["planning", "executing", "verifying", "awaiting-review"]) {
		const context = buildPhaseContext({ ...baseState, phase }, memoryConfig);
		assert.match(context, /AUTHORITATIVE GOAL SOURCES/);
		assert.match(context, /docs\/PRD\.md/);
		assert.match(context, /captured sha256 aaaaaaaaaaaa/);
		assert.doesNotMatch(context, /full pasted PRD body/);
		assert.ok(context.length < 2_000, `${phase} source metadata should remain bounded`);
	}
});
