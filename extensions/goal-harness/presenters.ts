import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	stepSymbol,
	type GoalState,
} from "./workflow.ts";

interface PlanViewEntry {
	content: string;
}

interface StatusViewEntry {
	content: string;
}

export const PLAN_VIEW_ENTRY = "goal-harness-plan";
export const STATUS_VIEW_ENTRY = "goal-harness-status";

export function truncate(text: string, length = 88): string {
	return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

export function formatState(state: GoalState): string {
	if (state.phase === "idle") return "No active goal.";
	const done = state.plan.filter((step) => step.status === "done").length;
	const lines = [
		`Goal: ${state.objective}`,
		`Phase: ${state.phase}`,
		`Progress: ${done}/${state.plan.length || "unplanned"}`,
		`Review policy: ${state.reviewPolicy}`,
		`Repair cycles: ${state.repairCycles}`,
	];
	const reviewStep = state.plan.find(
		(step) => step.status === "implemented" || step.status === "verified",
	);
	if (reviewStep) lines.push(`Awaiting approval: ${reviewStep.id}. ${reviewStep.title}`);
	if (state.verification) {
		lines.push(`Last verification: ${state.verification.verdict.toUpperCase()} — ${state.verification.summary}`);
	}
	if (state.blockedReason) lines.push(`Needs attention: ${state.blockedReason}`);
	return lines.join("\n");
}

function planText(state: Pick<GoalState, "plan">): string {
	return state.plan
		.map(
			(step) =>
				`${step.id}. [${step.status === "done" ? "x" : step.status === "verified" ? "verified" : " "}] ${step.title}\n   ${step.description}\n   Verify: ${step.verification}${step.evidence ? `\n   Evidence: ${step.evidence}` : ""}${step.review ? `\n   Independent step review: ${step.review.verdict.toUpperCase()} — ${step.review.summary}` : ""}`,
		)
		.join("\n");
}

export function formatPlanForReview(
	state: Pick<
		GoalState,
		"objective" | "phase" | "acceptanceCriteria" | "risks" | "plan" | "reviewPolicy"
	>,
): string {
	const criteria = state.acceptanceCriteria
		.map((criterion, index) => `${index + 1}. ${criterion}`)
		.join("\n");
	const risks =
		state.risks.length > 0
			? state.risks.map((risk, index) => `${index + 1}. ${risk}`).join("\n")
			: "None identified.";
	const nextAction =
		state.phase === "awaiting-execution"
			? "Review the criteria, risks, implementation details, and verification methods. Run /execute to approve this plan, or /plan to replace it."
			: "Run /plan to replace this plan. Use /goal-status for concise progress.";

	return `Goal plan

Goal: ${state.objective}
Phase: ${state.phase}
Review policy: ${state.reviewPolicy}

Acceptance criteria (${state.acceptanceCriteria.length})
${criteria}

Risks and assumptions (${state.risks.length})
${risks}

Implementation plan (${state.plan.length})
${planText(state)}

${nextAction}`;
}

export function registerPresenters(pi: ExtensionAPI): void {
	pi.registerEntryRenderer<PlanViewEntry>(
		PLAN_VIEW_ENTRY,
		(entry, _options, theme) => {
			const content = entry.data?.content ?? "Goal plan is unavailable.";
			const styled = content.replace(
				/^Goal plan/,
				theme.fg("accent", "Goal plan"),
			);
			return new Text(styled, 1, 0);
		},
	);
	pi.registerEntryRenderer<StatusViewEntry>(
		STATUS_VIEW_ENTRY,
		(entry) => new Text(entry.data?.content ?? "Goal status is unavailable.", 1, 0),
	);
}

export function displayPlan(pi: ExtensionAPI, state: GoalState): void {
	pi.appendEntry<PlanViewEntry>(PLAN_VIEW_ENTRY, {
		content: formatPlanForReview(state),
	});
}

export function displayStatus(pi: ExtensionAPI, content: string): void {
	pi.appendEntry<StatusViewEntry>(STATUS_VIEW_ENTRY, { content });
}

export function updateGoalUi(ctx: ExtensionContext, state: GoalState): void {
	if (state.phase === "idle") {
		ctx.ui.setStatus("goal-harness", undefined);
		ctx.ui.setWidget("goal-harness", undefined);
		return;
	}

	const done = state.plan.filter((step) => step.status === "done").length;
	const total = state.plan.length;
	ctx.ui.setStatus("goal-harness", `goal:${state.phase}${total > 0 ? ` ${done}/${total}` : ""}`);

	const lines = [
		`Goal: ${truncate(state.objective)}`,
		`Phase: ${state.phase}`,
		`Review: ${state.reviewPolicy}`,
	];
	for (const step of state.plan) {
		lines.push(`${stepSymbol(step.status)} ${step.id}. ${truncate(step.title, 76)}`);
	}
	if (state.verification) {
		lines.push(`Verification: ${state.verification.verdict.toUpperCase()} — ${truncate(state.verification.summary, 70)}`);
	}
	if (state.blockedReason) lines.push(`Attention: ${truncate(state.blockedReason, 72)}`);
	ctx.ui.setWidget("goal-harness", lines);
}
