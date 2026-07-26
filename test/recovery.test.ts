import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
	findRecoverableGoals,
	formatRecoveryStatus,
} from "../extensions/goala/recovery.ts";
import {
	emptyState,
	GOAL_STATE_ENTRY,
	type GoalState,
} from "../extensions/goala/workflow.ts";

function addSession(
	cwd: string,
	sessionDir: string,
	patch: Partial<GoalState>,
): SessionManager {
	const manager = SessionManager.create(cwd, sessionDir);
	manager.appendCustomEntry(GOAL_STATE_ENTRY, {
		...emptyState(),
		goalId: "goal-default",
		objective: "Build the current feature",
		phase: "awaiting-execution",
		startedAt: "2026-07-25T10:00:00.000Z",
		updatedAt: "2026-07-25T10:00:00.000Z",
		...patch,
	});
	manager.appendMessage({
		role: "assistant",
		content: [],
	} as never);
	return manager;
}

test("finds only the latest unfinished state for each goal in the current project", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-goal-recovery-"));
	const cwd = join(root, "project");
	const otherCwd = join(root, "other-project");
	const sessionDir = join(root, "sessions");
	mkdirSync(cwd);
	mkdirSync(otherCwd);

	addSession(cwd, sessionDir, {
		goalId: "goal-completed",
		objective: "Already finished",
		phase: "executing",
		updatedAt: "2026-07-25T10:00:00.000Z",
	});
	addSession(cwd, sessionDir, {
		goalId: "goal-completed",
		objective: "Already finished",
		phase: "complete",
		updatedAt: "2026-07-25T10:05:00.000Z",
	});
	const recoverable = addSession(cwd, sessionDir, {
		goalId: "goal-recoverable",
		objective: "Resume this goal",
		phase: "paused",
		updatedAt: "2026-07-25T10:10:00.000Z",
	});
	addSession(otherCwd, sessionDir, {
		goalId: "goal-other-project",
		objective: "Do not show this",
		phase: "executing",
		updatedAt: "2026-07-25T10:20:00.000Z",
	});
	const malformed = SessionManager.create(cwd, sessionDir);
	malformed.appendCustomEntry(GOAL_STATE_ENTRY, {
		version: 999,
		objective: "Do not trust this",
		phase: "executing",
	});
	malformed.appendMessage({
		role: "assistant",
		content: [],
	} as never);

	const goals = await findRecoverableGoals(cwd, sessionDir);
	assert.equal(goals.length, 1);
	assert.equal(goals[0].state.objective, "Resume this goal");
	assert.equal(goals[0].sessionId, recoverable.getSessionId());
});

test("formats an exact command for the most recent recoverable goal", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-goal-recovery-current-"));
	const cwd = join(root, "project");
	const sessionDir = join(root, "sessions");
	mkdirSync(cwd);

	addSession(cwd, sessionDir, {
		goalId: "goal-older",
		objective: "Older unfinished goal",
		phase: "executing",
		updatedAt: "2026-07-25T10:00:00.000Z",
	});
	const latest = addSession(cwd, sessionDir, {
		goalId: "goal-latest",
		objective: "Latest\nunfinished   goal",
		phase: "awaiting-execution",
		updatedAt: "2026-07-25T10:10:00.000Z",
	});

	const goals = await findRecoverableGoals(cwd, sessionDir);
	assert.equal(goals.length, 2);
	assert.equal(goals[0].sessionId, latest.getSessionId());
	assert.match(formatRecoveryStatus(goals), /Latest unfinished goal/);
	assert.match(
		formatRecoveryStatus(goals),
		new RegExp(`pi --session ${latest.getSessionId()}`),
	);
	assert.doesNotMatch(formatRecoveryStatus(goals), /Older unfinished goal/);
});

test("reports an explicit empty recovery result", () => {
	assert.equal(
		formatRecoveryStatus([]),
		"No active goal in this Pi session.\nNo recoverable unfinished goals were found for this working directory.",
	);
});

test("does not emit an unsafe session ID as a shell command", () => {
	const state = {
		...emptyState(),
		goalId: "goal-unsafe-id",
		objective: "Safe objective\u001b[31m",
		phase: "executing" as const,
	};
	const output = formatRecoveryStatus([{
		sessionId: "unsafe; touch file",
		sessionPath: "/tmp/session",
		state,
		updatedAt: 1,
	}]);
	assert.match(output, /Safe objective \[31m/);
	assert.match(output, /pi -r/);
	assert.doesNotMatch(output, /pi --session/);
});

test("matches sessions created through another path to the same directory", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-goal-recovery-alias-"));
	const cwd = join(root, "project");
	const alias = join(root, "project-alias");
	const sessionDir = join(root, "sessions");
	mkdirSync(cwd);
	symlinkSync(cwd, alias, "dir");
	const session = addSession(cwd, sessionDir, {
		goalId: "goal-alias",
		objective: "Recover through a path alias",
		phase: "awaiting-review",
	});

	const goals = await findRecoverableGoals(alias, sessionDir);
	assert.equal(goals.length, 1);
	assert.equal(goals[0].sessionId, session.getSessionId());
});

test("a newer idle tombstone suppresses an intentionally cleared goal", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-goal-recovery-cleared-"));
	const cwd = join(root, "project");
	const sessionDir = join(root, "sessions");
	mkdirSync(cwd);
	addSession(cwd, sessionDir, {
		goalId: "goal-cleared",
		objective: "Do not resurrect this goal",
		phase: "executing",
		updatedAt: "2026-07-25T10:00:00.000Z",
	});
	addSession(cwd, sessionDir, {
		goalId: "goal-cleared",
		objective: "Do not resurrect this goal",
		phase: "idle",
		updatedAt: "2026-07-25T10:05:00.000Z",
	});

	assert.deepEqual(await findRecoverableGoals(cwd, sessionDir), []);
});
