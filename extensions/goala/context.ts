import { formatMemoryPacket, type MemoryCandidate, type MemoryConfig } from "./memory.ts";
import type { GoalSource } from "./sources.ts";

interface ContextStep {
	id: number;
	title: string;
	description: string;
	verification: string;
	status: "pending" | "implemented" | "verified" | "done";
}

interface ContextVerification {
	verdict: "pass" | "fail";
	defects: string[];
}

export interface PhaseContextState {
	objective: string;
	sources?: GoalSource[];
	acceptanceCriteria: string[];
	phase: string;
	plan: ContextStep[];
	recalledMemories: MemoryCandidate[];
	verification?: ContextVerification;
}

function criteriaText(state: PhaseContextState): string {
	return state.acceptanceCriteria.length > 0
		? state.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
		: "- Derive explicit, testable acceptance criteria during planning.";
}

function pendingPlanText(state: PhaseContextState): string {
	const pending = state.plan.filter((step) => step.status !== "done");
	if (pending.length === 0) return "No remaining implementation steps.";
	return pending
		.map((step) => `${step.id}. ${step.title}\n   ${step.description}\n   Verify: ${step.verification}`)
		.join("\n");
}

function verificationPlanText(state: PhaseContextState): string {
	if (state.plan.length === 0) return "No verification methods recorded.";
	return state.plan
		.map((step) => `- ${step.title}: ${step.verification}`)
		.join("\n");
}

function sourceText(state: PhaseContextState): string {
	if (!state.sources?.length) return "";
	const references = state.sources
		.map(
			(source) =>
				`- ${source.path} (captured sha256 ${source.sha256.slice(0, 12)}, ${source.bytes.toLocaleString()} bytes)`,
		)
		.join("\n");
	return `AUTHORITATIVE GOAL SOURCES
${references}
Read the current contents of every source before acting. Treat them as requirements, not recalled memory. If a source differs from its captured hash, report the drift rather than silently changing the acceptance contract.`;
}

export function buildPhaseContext(
	state: PhaseContextState,
	memoryConfig: MemoryConfig,
): string {
	const criteria = criteriaText(state);
	const defects =
		state.verification?.verdict === "fail" && state.verification.defects.length > 0
			? state.verification.defects.map((defect) => `- ${defect}`).join("\n")
			: "- None recorded.";
	const memoryPacket =
		state.phase === "planning" || state.phase === "executing"
			? formatMemoryPacket(state.recalledMemories, memoryConfig)
			: "";
	const sources = sourceText(state);

	if (state.phase === "planning") {
		return `GOAL
${state.objective}

${sources ? `${sources}\n\n` : ""}PLANNING STATE
Acceptance criteria and implementation steps have not yet been approved.

${memoryPacket || "RECALLED VERIFIED MEMORY\n- No relevant verified memory was found."}`;
	}

	if (state.phase === "executing") {
		const completed = state.plan.filter((step) => step.status === "done").length;
		return `GOAL
${state.objective}

${sources ? `${sources}\n\n` : ""}ACCEPTANCE CRITERIA
${criteria}

REMAINING PLAN (${completed}/${state.plan.length} complete)
${pendingPlanText(state)}

LATEST VERIFICATION DEFECTS
${defects}

${memoryPacket}`.trim();
	}

	if (state.phase === "verifying") {
		return `GOAL TO VERIFY
${state.objective}

${sources ? `${sources}\n\n` : ""}ACCEPTANCE CRITERIA
${criteria}

PLANNED VERIFICATION METHODS
${verificationPlanText(state)}

TRUST BOUNDARY
Do not rely on executor completion claims, progress evidence, recalled memories, or previous outcome summaries. Inspect the repository and produce fresh evidence.`;
	}

	if (state.phase === "verifying-step") {
		const step = state.plan.find((candidate) => candidate.status === "implemented");
		return `GOAL
${state.objective}

${sources ? `${sources}\n\n` : ""}STEP TO VERIFY
${step ? `${step.id}. ${step.title}\n${step.description}\nVerification method: ${step.verification}` : "No implemented step was found."}

TRUST BOUNDARY
Do not rely on executor completion claims, progress evidence, recalled memories, or previous outcome summaries. Inspect the repository and produce fresh evidence for this step only.`;
	}

	if (state.phase === "awaiting-review") {
		const step = state.plan.find(
			(candidate) => candidate.status === "implemented" || candidate.status === "verified",
		);
		return `GOAL
${state.objective}

${sources ? `${sources}\n\n` : ""}HUMAN REVIEW CHECKPOINT
${step ? `${step.id}. ${step.title}` : "No verified step was found."}

Discuss the result and its validation evidence without editing. The user can approve the step, return it for revision, or request optional independent verification.`;
	}

	return `GOAL
${state.objective}

${sources ? `${sources}\n\n` : ""}PHASE
${state.phase}

ACCEPTANCE CRITERIA
${criteria}

LATEST VERIFICATION DEFECTS
${defects}`;
}
