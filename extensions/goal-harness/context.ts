import { formatMemoryPacket, type MemoryCandidate, type MemoryConfig } from "./memory.ts";

interface ContextStep {
	id: number;
	title: string;
	description: string;
	verification: string;
	status: "pending" | "done";
}

interface ContextVerification {
	verdict: "pass" | "fail";
	defects: string[];
}

export interface PhaseContextState {
	objective: string;
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

	if (state.phase === "planning") {
		return `GOAL
${state.objective}

PLANNING STATE
Acceptance criteria and implementation steps have not yet been approved.

${memoryPacket || "RECALLED VERIFIED MEMORY\n- No relevant verified memory was found."}`;
	}

	if (state.phase === "executing") {
		const completed = state.plan.filter((step) => step.status === "done").length;
		return `GOAL
${state.objective}

ACCEPTANCE CRITERIA
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

ACCEPTANCE CRITERIA
${criteria}

PLANNED VERIFICATION METHODS
${verificationPlanText(state)}

TRUST BOUNDARY
Do not rely on executor completion claims, progress evidence, recalled memories, or previous outcome summaries. Inspect the repository and produce fresh evidence.`;
	}

	return `GOAL
${state.objective}

PHASE
${state.phase}

ACCEPTANCE CRITERIA
${criteria}

LATEST VERIFICATION DEFECTS
${defects}`;
}
