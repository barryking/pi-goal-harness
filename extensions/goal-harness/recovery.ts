import {
	SessionManager,
	type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import {
	GOAL_STATE_ENTRY,
	normalizeState,
	type GoalState,
} from "./workflow.ts";

const MAX_RECOVERY_SESSIONS = 100;

export interface RecoverableGoal {
	sessionId: string;
	sessionPath: string;
	state: GoalState;
	updatedAt: number;
}

interface StateEntry {
	id?: string;
	parentId?: string | null;
	type?: string;
	customType?: string;
	data?: unknown;
	timestamp?: string;
}

interface SessionNode {
	parentId: string | null;
	state?: StateEntry;
}

function timestamp(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function rawString(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const candidate = (value as Record<string, unknown>)[key];
	return typeof candidate === "string" ? candidate : undefined;
}

function pathIdentity(value: string): string {
	try {
		const stat = statSync(value);
		return `${stat.dev}:${stat.ino}`;
	} catch {
		const path = resolve(value);
		return process.platform === "win32" ? path.toLowerCase() : path;
	}
}

async function sessionsForProject(
	cwd: string,
	sessionDir: string,
): Promise<SessionInfo[]> {
	const cwdIdentity = pathIdentity(cwd);
	const configured = await SessionManager.listAll(sessionDir).catch(() => []);
	const defaultSessions = await SessionManager.list(cwd).catch(() => []);
	const unique = new Map<string, SessionInfo>();
	for (const session of [...configured, ...defaultSessions]) {
		if (!session.cwd || pathIdentity(session.cwd) !== cwdIdentity) continue;
		unique.set(pathIdentity(session.path), session);
	}
	return [...unique.values()].sort(
		(a, b) => b.modified.getTime() - a.modified.getTime(),
	);
}

async function latestState(
	session: SessionInfo,
): Promise<{ state: GoalState; goalKey: string; updatedAt: number } | undefined> {
	try {
		const nodes = new Map<string, SessionNode>();
		let leafId: string | undefined;
		const lines = createInterface({
			input: createReadStream(session.path, { encoding: "utf8" }),
			crlfDelay: Infinity,
		});
		for await (const line of lines) {
			let entry: StateEntry;
			try {
				entry = JSON.parse(line) as StateEntry;
			} catch {
				continue;
			}
			if (entry.type === "session" || typeof entry.id !== "string") continue;
			nodes.set(entry.id, {
				parentId: typeof entry.parentId === "string" ? entry.parentId : null,
				state:
					entry.type === "custom" && entry.customType === GOAL_STATE_ENTRY
						? entry
						: undefined,
			});
			leafId = entry.id;
		}

		let entry: StateEntry | undefined;
		const visited = new Set<string>();
		while (leafId && !visited.has(leafId)) {
			visited.add(leafId);
			const node = nodes.get(leafId);
			if (!node) break;
			if (node.state) {
				entry = node.state;
				break;
			}
			leafId = node.parentId ?? undefined;
		}
		if (!entry) return undefined;

		const state = normalizeState(entry.data);
		if (!state.objective) return undefined;
		const rawGoalId = rawString(entry.data, "goalId");
		const rawStartedAt = rawString(entry.data, "startedAt");
		const goalKey =
			rawGoalId ||
			`legacy:${state.objective}:${rawStartedAt ?? session.id}`;
		const updatedAt =
			timestamp(rawString(entry.data, "updatedAt")) ??
			timestamp(entry.timestamp) ??
			session.modified.getTime();
		return { state, goalKey, updatedAt };
	} catch {
		// Session discovery is best-effort. A partially written or malformed
		// session must not break /goal-status.
		return undefined;
	}
}

export async function findRecoverableGoals(
	cwd: string,
	sessionDir: string,
): Promise<RecoverableGoal[]> {
	let sessions: SessionInfo[];
	try {
		sessions = await sessionsForProject(cwd, sessionDir);
	} catch {
		return [];
	}

	const latestByGoal = new Map<string, RecoverableGoal>();

	for (const session of sessions.slice(0, MAX_RECOVERY_SESSIONS)) {
		const recovered = await latestState(session);
		if (!recovered) continue;

		const existing = latestByGoal.get(recovered.goalKey);
		if (!existing || recovered.updatedAt > existing.updatedAt) {
			latestByGoal.set(recovered.goalKey, {
				sessionId: session.id,
				sessionPath: session.path,
				state: recovered.state,
				updatedAt: recovered.updatedAt,
			});
		}
	}

	return [...latestByGoal.values()]
		.filter(({ state }) => state.phase !== "idle" && state.phase !== "complete")
		.sort((a, b) => b.updatedAt - a.updatedAt);
}

function oneLine(value: string): string {
	return value
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 300);
}

function safeSessionId(value: string): string | undefined {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
		? value
		: undefined;
}

export function formatRecoveryStatus(goals: RecoverableGoal[]): string {
	if (goals.length === 0) {
		return "No active goal in this Pi session.\nNo recoverable unfinished goals were found for this working directory.";
	}

	const latest = goals[0];
	const sessionId = safeSessionId(latest.sessionId);
	const lines = [
		"No active goal in this Pi session.",
		"",
		"Recoverable goal found:",
		`Goal: ${oneLine(latest.state.objective)}`,
		`Phase: ${latest.state.phase}`,
		`Progress: ${latest.state.plan.filter((step) => step.status === "done").length}/${latest.state.plan.length || "unplanned"}`,
		"",
		sessionId ? "Resume it from your shell:" : "Select it from your shell:",
		sessionId ? `pi --session ${sessionId}` : "pi -r",
	];
	if (goals.length > 1) {
		lines.push(
			"",
			`${goals.length} unfinished goals were found. Run pi -r to choose a different saved session.`,
		);
	}
	return lines.join("\n");
}
