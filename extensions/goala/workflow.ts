import type { ReviewPolicy } from "./config.ts";
import { randomUUID } from "node:crypto";
import {
	MAX_GOAL_MEMORY_CHARS,
	MAX_GOAL_MEMORY_REFERENCES,
	emptyGoalMemoryContext,
	type GoalMemoryContext,
	type GoalMemoryReference,
} from "./dream.ts";
import {
	MAX_GOAL_SOURCE_BYTES,
	MAX_GOAL_SOURCES,
	type GoalSource,
} from "./sources.ts";

export const GOAL_STATE_ENTRY = "goala-state";

export const PHASES = [
	"idle",
	"planning",
	"awaiting-execution",
	"executing",
	"verifying-step",
	"awaiting-review",
	"verifying",
	"paused",
	"needs-attention",
	"complete",
] as const;
export type Phase = (typeof PHASES)[number];

export const STEP_STATUSES = ["pending", "implemented", "verified", "done"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export type CheckStatus = "pass" | "fail" | "not_run";

export interface VerificationCheck {
	name: string;
	status: CheckStatus;
	evidence: string;
}

export interface VerificationResult {
	verdict: "pass" | "fail";
	summary: string;
	checks: VerificationCheck[];
	defects: string[];
	at: string;
}

export interface PlanStep {
	id: number;
	title: string;
	description: string;
	verification: string;
	status: StepStatus;
	evidence?: string;
	review?: VerificationResult;
}

export interface GoalState {
	version: 1 | 2 | 3 | 4 | 5;
	goalId: string;
	objective: string;
	sources: GoalSource[];
	acceptanceCriteria: string[];
	risks: string[];
	phase: Phase;
	plan: PlanStep[];
	reviewPolicy: ReviewPolicy;
	repairCycles: number;
	stepRepairCycles: number;
	friction: string[];
	openItems: string[];
	memoryContext: GoalMemoryContext;
	sessionFiles: string[];
	verification?: VerificationResult;
	reviewFeedback?: string;
	pausedFrom?: Phase;
	blockedReason?: string;
	startedAt?: string;
	updatedAt: string;
}

export function newGoalId(): string {
	return randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function nonNegativeInteger(value: unknown): number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeVerification(value: unknown): VerificationResult | undefined {
	if (!isRecord(value)) return undefined;
	if (value.verdict !== "pass" && value.verdict !== "fail") return undefined;
	const checks = Array.isArray(value.checks)
		? value.checks.flatMap((check) => {
			if (!isRecord(check)) return [];
			if (
				typeof check.name !== "string" ||
				typeof check.evidence !== "string" ||
				(check.status !== "pass" && check.status !== "fail" && check.status !== "not_run")
			) return [];
			const status: CheckStatus = check.status;
			return [{
				name: check.name,
				status,
				evidence: check.evidence,
			}];
		})
		: [];
	return {
		verdict: value.verdict,
		summary: optionalString(value.summary) ?? "",
		checks,
		defects: stringArray(value.defects),
		at: optionalString(value.at) ?? new Date(0).toISOString(),
	};
}

function normalizePlan(value: unknown): PlanStep[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item, index) => {
		if (!isRecord(item)) return [];
		if (
			typeof item.title !== "string" ||
			typeof item.description !== "string" ||
			typeof item.verification !== "string"
		) return [];
		const status = STEP_STATUSES.includes(item.status as StepStatus)
			? item.status as StepStatus
			: "pending";
		return [{
			id:
				typeof item.id === "number" && Number.isInteger(item.id) && item.id > 0
					? item.id
					: index + 1,
			title: item.title,
			description: item.description,
			verification: item.verification,
			status,
			evidence: optionalString(item.evidence),
			review: normalizeVerification(item.review),
		}];
	});
}

function normalizeSources(value: unknown): GoalSource[] {
	if (!Array.isArray(value)) return [];
	return value.slice(0, MAX_GOAL_SOURCES).flatMap((source) => {
		if (
			!isRecord(source) ||
			typeof source.path !== "string" ||
			source.path.length === 0 ||
			source.path.length > 1000 ||
			source.path.startsWith("/") ||
			/^[A-Za-z]:[\\/]/.test(source.path) ||
			source.path.split(/[\\/]/).includes("..") ||
			typeof source.sha256 !== "string" ||
			!/^[a-f0-9]{64}$/.test(source.sha256) ||
			typeof source.bytes !== "number" ||
			!Number.isInteger(source.bytes) ||
			source.bytes < 0 ||
			source.bytes > MAX_GOAL_SOURCE_BYTES
		) return [];
		return [{
			path: source.path,
			sha256: source.sha256,
			bytes: source.bytes,
		}];
	});
}

function normalizeMemoryContext(value: unknown): GoalMemoryContext {
	if (!isRecord(value)) return emptyGoalMemoryContext();
	const status = value.status === "available" || value.status === "error"
		? value.status
		: "unavailable";
	let totalChars = 0;
	const references = Array.isArray(value.references)
		? value.references.slice(0, MAX_GOAL_MEMORY_REFERENCES).flatMap((reference) => {
			if (
				!isRecord(reference) ||
				(reference.authority !== "advisory" && reference.authority !== "binding") ||
				(reference.storeScope !== "repository" && reference.storeScope !== "workspace") ||
				!["storeId", "storeName", "commit", "path", "sha256", "content"].every(
					(key) => typeof reference[key] === "string",
				) ||
				!/^[a-f0-9]{64}$/.test(reference.sha256 as string) ||
				(reference.content as string).length + totalChars > MAX_GOAL_MEMORY_CHARS
			) return [];
			totalChars += (reference.content as string).length;
			return [reference as unknown as GoalMemoryReference];
		})
		: [];
	return {
		status,
		repositoryIdentity: optionalString(value.repositoryIdentity),
		references,
		message: optionalString(value.message),
	};
}

export function emptyState(reviewPolicy: ReviewPolicy = "final"): GoalState {
	return {
		version: 5,
		goalId: "",
		objective: "",
		sources: [],
		acceptanceCriteria: [],
		risks: [],
		phase: "idle",
		plan: [],
		reviewPolicy,
		repairCycles: 0,
		stepRepairCycles: 0,
		friction: [],
		openItems: [],
		memoryContext: emptyGoalMemoryContext(),
		sessionFiles: [],
		updatedAt: new Date().toISOString(),
	};
}

export function normalizeState(value: unknown): GoalState {
	if (!isRecord(value) || ![1, 2, 3, 4, 5].includes(Number(value.version))) return emptyState();
	const phase = PHASES.includes(value.phase as Phase) ? value.phase as Phase : "idle";
	const pausedFrom = PHASES.includes(value.pausedFrom as Phase)
		? value.pausedFrom as Phase
		: undefined;
	return {
		...emptyState(),
		version: 5,
		goalId: optionalString(value.goalId) || newGoalId(),
		objective: optionalString(value.objective) ?? "",
		sources: normalizeSources(value.sources),
		acceptanceCriteria: stringArray(value.acceptanceCriteria),
		risks: stringArray(value.risks),
		phase,
		plan: normalizePlan(value.plan),
		reviewPolicy: value.reviewPolicy === "per-step" ? "per-step" : "final",
		repairCycles: nonNegativeInteger(value.repairCycles),
		stepRepairCycles: nonNegativeInteger(value.stepRepairCycles),
		friction: stringArray(value.friction),
		openItems: stringArray(value.openItems),
		memoryContext: normalizeMemoryContext(value.memoryContext),
		sessionFiles: stringArray(value.sessionFiles),
		verification: normalizeVerification(value.verification),
		reviewFeedback: optionalString(value.reviewFeedback),
		pausedFrom,
		blockedReason: optionalString(value.blockedReason),
		startedAt: optionalString(value.startedAt),
		updatedAt: optionalString(value.updatedAt) ?? new Date().toISOString(),
	};
}

export function stepSymbol(status: StepStatus): string {
	switch (status) {
		case "done":
			return "✓";
		case "verified":
			return "◆";
		case "implemented":
			return "◐";
		default:
			return "○";
	}
}

export function verificationValidationError(
	verdict: "pass" | "fail",
	summary: string,
	checks: VerificationCheck[],
	defects: string[],
): string | undefined {
	if (!summary.trim()) return "Verification rejected: a non-empty summary is required.";
	if (checks.some((check) => !check.name.trim() || !check.evidence.trim())) {
		return "Verification rejected: every check requires a name and concrete evidence.";
	}
	if (verdict === "pass" && (checks.some((check) => check.status !== "pass") || defects.length > 0)) {
		return "PASS rejected: every check must pass and the defects list must be empty.";
	}
	if (verdict === "fail" && (defects.length === 0 || defects.some((defect) => !defect.trim()))) {
		return "FAIL rejected: provide at least one actionable defect.";
	}
}
