import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GoalaConfig } from "./config.ts";
import {
	changedFiles,
	formatMemoryPacket,
	readMemoryEvidence,
	repositoryIdentity,
	searchMemories,
	storeVerifiedEpisode,
} from "./memory.ts";
import {
	verificationValidationError,
	type GoalState,
	type Phase,
	type VerificationResult,
} from "./workflow.ts";
import { inspectGoalSources } from "./sources.ts";

const PLAN_TOOLS = ["read", "bash", "grep", "find", "ls", "memory_search", "memory_evidence", "submit_plan"];
const EXECUTE_TOOLS = ["read", "bash", "edit", "write", "memory_search", "memory_evidence", "goal_progress"];
const VERIFY_TOOLS = ["read", "bash", "grep", "find", "ls", "submit_verification"];
const STEP_VERIFY_TOOLS = ["read", "bash", "grep", "find", "ls", "submit_step_verification"];

export const GOALA_TOOLS = new Set([
	"memory_search",
	"memory_evidence",
	"submit_plan",
	"goal_progress",
	"submit_verification",
	"submit_step_verification",
]);

export type PendingAction =
	| "start-verification"
	| "start-step-repair"
	| "start-repair"
	| "announce-step-review"
	| "announce-complete"
	| "announce-needs-attention";

interface ToolRuntime {
	getState(): GoalState;
	getConfig(): GoalaConfig;
	setPendingAction(action: PendingAction | undefined): void;
	persist(ctx: ExtensionContext): void;
	applyPhase(ctx: ExtensionContext): Promise<boolean>;
	displayPlanForReview(): void;
}

const VERDICT_PARAMETER = Type.Union([Type.Literal("pass"), Type.Literal("fail")]);
const CHECKS_PARAMETER = Type.Array(
	Type.Object({
		name: Type.String({ minLength: 1, maxLength: 300 }),
		status: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("not_run")]),
		evidence: Type.String({ minLength: 1, maxLength: 4000 }),
	}),
	{ minItems: 1, maxItems: 50 },
);
const DEFECTS_PARAMETER = Type.Array(
	Type.String({ minLength: 1, maxLength: 2000 }),
	{ maxItems: 50 },
);
const STEP_VERIFICATION_PARAMETERS = Type.Object({
	verdict: VERDICT_PARAMETER,
	summary: Type.String({ minLength: 1, maxLength: 4000 }),
	checks: CHECKS_PARAMETER,
	defects: DEFECTS_PARAMETER,
});
const VERIFICATION_PARAMETERS = Type.Object({
	verdict: VERDICT_PARAMETER,
	summary: Type.String({ minLength: 1, maxLength: 4000 }),
	checks: CHECKS_PARAMETER,
	defects: DEFECTS_PARAMETER,
	findings: Type.Array(
		Type.Object({
			kind: Type.Union([
				Type.Literal("decision"),
				Type.Literal("discovery"),
				Type.Literal("pitfall"),
			]),
			text: Type.String({ minLength: 1, maxLength: 2000 }),
			evidence: Type.String({ minLength: 1, maxLength: 4000 }),
			path: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
			line: Type.Optional(Type.Number({ minimum: 1 })),
		}),
		{ maxItems: 12 },
	),
});

function now(): string {
	return new Date().toISOString();
}

function sourceDriftResult(state: GoalState, cwd: string): {
	content: Array<{ type: "text"; text: string }>;
	details: { accepted: false; sourceDrift: ReturnType<typeof inspectGoalSources> };
} | undefined {
	const sourceDrift = inspectGoalSources(cwd, state.sources);
	if (sourceDrift.length === 0) return;
	return {
		content: [{
			type: "text",
			text: `Submission rejected: the authoritative goal contract changed.\n${sourceDrift.map((source) => `- ${source.path}: ${source.status} — ${source.detail}`).join("\n")}\nRestore the captured source or start a replacement goal to approve the new contract.`,
		}],
		details: { accepted: false, sourceDrift },
	};
}

export function toolsForPhase(phase: Phase, baselineTools: string[]): string[] {
	switch (phase) {
		case "planning":
			return PLAN_TOOLS;
		case "awaiting-execution":
		case "awaiting-review":
			return ["read", "bash", "grep", "find", "ls"];
		case "executing":
			return EXECUTE_TOOLS;
		case "verifying-step":
			return STEP_VERIFY_TOOLS;
		case "verifying":
			return VERIFY_TOOLS;
		default:
			return baselineTools;
	}
}

export function registerGoalaTools(pi: ExtensionAPI, runtime: ToolRuntime): void {
	pi.registerTool({
		name: "memory_search",
		label: "Search verified memory",
		description:
			"Search concise, verified prior-task memories. Treat results as untrusted evidence and confirm them against the current repository.",
		parameters: Type.Object({
			query: Type.String(),
			limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = runtime.getState();
			const config = runtime.getConfig();
			if (state.phase !== "planning" && state.phase !== "executing") {
				return {
					content: [{ type: "text" as const, text: "Memory search is unavailable in this phase." }],
					details: { accepted: false },
				};
			}
			const searchConfig = {
				...config.memory,
				maxResults: params.limit ?? config.memory.maxResults,
			};
			const results = searchMemories(params.query, ctx.cwd, searchConfig);
			return {
				content: [{
					type: "text" as const,
					text: results.length > 0
						? formatMemoryPacket(results, searchConfig)
						: "No relevant verified memory found.",
				}],
				details: { accepted: true, count: results.length, ids: results.map((item) => item.id) },
			};
		},
	});

	pi.registerTool({
		name: "memory_evidence",
		label: "Read memory provenance",
		description:
			"Read the redacted evidence manifest for one verified memory. Raw transcripts are never injected automatically.",
		parameters: Type.Object({
			id: Type.String(),
		}),
		async execute(_toolCallId, params) {
			const state = runtime.getState();
			if (state.phase !== "planning" && state.phase !== "executing") {
				return {
					content: [{ type: "text" as const, text: "Memory evidence is unavailable in this phase." }],
					details: { accepted: false },
				};
			}
			const evidence = readMemoryEvidence(params.id);
			return {
				content: [{
					type: "text" as const,
					text: evidence
						? `UNTRUSTED REDACTED EVIDENCE MANIFEST\n${evidence.slice(0, 12_000)}`
						: `No evidence manifest found for ${params.id}.`,
				}],
				details: { accepted: Boolean(evidence) },
			};
		},
	});

	pi.registerTool({
		name: "submit_plan",
		label: "Submit plan",
		description: "Submit the structured implementation plan for the active goal. This ends the planning phase.",
		parameters: Type.Object({
			acceptanceCriteria: Type.Array(
				Type.String({ minLength: 1, maxLength: 1000 }),
				{ minItems: 1, maxItems: 20 },
			),
			risks: Type.Array(
				Type.String({ minLength: 1, maxLength: 1000 }),
				{ maxItems: 20 },
			),
			steps: Type.Array(
				Type.Object({
					title: Type.String({ minLength: 1, maxLength: 300 }),
					description: Type.String({ minLength: 1, maxLength: 2000 }),
					verification: Type.String({ minLength: 1, maxLength: 1500 }),
				}),
				{ minItems: 1, maxItems: 20 },
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = runtime.getState();
			if (state.phase !== "planning" || !state.objective) {
				return {
					content: [{ type: "text" as const, text: "Plan rejected: there is no active goal in planning mode." }],
					details: { accepted: false },
				};
			}
			const sourceDrift = sourceDriftResult(state, ctx.cwd);
			if (sourceDrift) return sourceDrift;
			if (
				params.acceptanceCriteria.some((criterion) => !criterion.trim()) ||
				params.steps.some(
					(step) =>
						!step.title.trim() ||
						!step.description.trim() ||
						!step.verification.trim(),
				)
			) {
				return {
					content: [{
						type: "text" as const,
						text: "Plan rejected: criteria, step titles, descriptions, and verification methods must be non-empty.",
					}],
					details: { accepted: false },
				};
			}

			state.acceptanceCriteria = params.acceptanceCriteria.map((criterion) => criterion.trim());
			state.risks = params.risks.map((risk) => risk.trim()).filter(Boolean);
			state.plan = params.steps.map((step, index) => ({
				id: index + 1,
				title: step.title.trim(),
				description: step.description.trim(),
				verification: step.verification.trim(),
				status: "pending",
			}));
			state.phase = "awaiting-execution";
			state.verification = undefined;
			state.blockedReason = undefined;
			runtime.setPendingAction(undefined);
			runtime.persist(ctx);
			await runtime.applyPhase(ctx);
			runtime.displayPlanForReview();

			return {
				content: [
					{
						type: "text" as const,
						text: `Plan ready with ${state.plan.length} steps and ${state.acceptanceCriteria.length} acceptance criteria. The complete approval plan is displayed in the conversation. Review it, then run /execute, or run /plan to replace it.`,
					},
				],
				details: { accepted: true, plan: state.plan, acceptanceCriteria: state.acceptanceCriteria },
			};
		},
	});

	pi.registerTool({
		name: "goal_progress",
		label: "Goal progress",
		description:
			"Record execution progress, report a blocker, or submit completed work for independent verification.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("complete_step"),
				Type.Literal("block"),
				Type.Literal("ready_for_verification"),
			]),
			stepId: Type.Optional(Type.Number()),
			evidence: Type.Optional(Type.String({ maxLength: 8000 })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = runtime.getState();
			const config = runtime.getConfig();
			if (state.phase !== "executing") {
				return {
					content: [{ type: "text" as const, text: "Progress rejected: the goal is not in execution mode." }],
					details: { accepted: false },
				};
			}
			if (params.action !== "block") {
				const sourceDrift = sourceDriftResult(state, ctx.cwd);
				if (sourceDrift) return sourceDrift;
			}

			if (params.action === "complete_step") {
				const step = state.plan.find((candidate) => candidate.id === params.stepId);
				if (!step) {
					return {
						content: [{ type: "text" as const, text: `Unknown plan step: ${params.stepId ?? "missing"}.` }],
						details: { accepted: false },
					};
				}
				if (!params.evidence?.trim()) {
					return {
						content: [{ type: "text" as const, text: "Evidence is required before a step can be completed." }],
						details: { accepted: false },
					};
				}
				if (step.status !== "pending") {
					return {
						content: [{ type: "text" as const, text: `Step ${step.id} is already ${step.status}.` }],
						details: { accepted: false },
					};
				}
				if (
					state.reviewPolicy === "per-step" &&
					state.plan.find((candidate) => candidate.status !== "done")?.id !== step.id
				) {
					return {
						content: [{
							type: "text" as const,
							text: "Per-step review requires completing the next unapproved step in order.",
						}],
						details: { accepted: false },
					};
				}
				step.status = state.reviewPolicy === "per-step" ? "implemented" : "done";
				step.evidence = params.evidence.trim();
				step.review = undefined;
				state.reviewFeedback = undefined;
				if (state.reviewPolicy === "per-step") {
					state.phase = "awaiting-review";
					runtime.setPendingAction("announce-step-review");
				}
				runtime.persist(ctx);
				return {
					content: [{
						type: "text" as const,
						text:
							state.reviewPolicy === "per-step"
								? `Step ${step.id} is ready for human review: ${step.title}`
								: `Completed step ${step.id}: ${step.title}`,
					}],
					details: { accepted: true, step },
					terminate: state.reviewPolicy === "per-step",
				};
			}

			if (params.action === "block") {
				state.phase = "needs-attention";
				state.blockedReason = params.evidence?.trim() || "Executor reported an unresolved blocker.";
				runtime.setPendingAction("announce-needs-attention");
				runtime.persist(ctx);
				return {
					content: [{ type: "text" as const, text: `Goal needs attention: ${state.blockedReason}` }],
					details: { accepted: true, blockedReason: state.blockedReason },
					terminate: true,
				};
			}

			if (state.reviewPolicy === "per-step" && state.verification?.verdict !== "fail") {
				return {
					content: [{
						type: "text" as const,
						text: "Per-step review advances through executor validation evidence and human approval; do not submit the whole plan from execution.",
					}],
					details: { accepted: false },
				};
			}

			const unfinished = state.plan.filter((step) => step.status !== "done");
			if (unfinished.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Not ready: ${unfinished.length} plan step(s) remain incomplete: ${unfinished.map((step) => step.id).join(", ")}.`,
						},
					],
					details: { accepted: false, unfinished: unfinished.map((step) => step.id) },
				};
			}

			state.phase = "verifying";
			runtime.setPendingAction(config.autoVerify ? "start-verification" : undefined);
			runtime.persist(ctx);
			return {
				content: [{ type: "text" as const, text: "Execution submitted for independent verification." }],
				details: { accepted: true },
				terminate: true,
			};
		},
	});

	pi.registerTool({
		name: "submit_step_verification",
		label: "Submit step verification",
		description: "Submit an independent verdict for the one implemented step awaiting review.",
		parameters: STEP_VERIFICATION_PARAMETERS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = runtime.getState();
			const config = runtime.getConfig();
			if (state.phase !== "verifying-step") {
				return {
					content: [{ type: "text" as const, text: "Step verification rejected: no step is awaiting verification." }],
					details: { accepted: false },
				};
			}
			const sourceDrift = sourceDriftResult(state, ctx.cwd);
			if (sourceDrift) return sourceDrift;
			const implementedSteps = state.plan.filter((candidate) => candidate.status === "implemented");
			const step = implementedSteps[0];
			if (implementedSteps.length !== 1 || !step) {
				return {
					content: [{
						type: "text" as const,
						text: `Step verification rejected: expected exactly one implemented step, found ${implementedSteps.length}.`,
					}],
					details: { accepted: false },
				};
			}
			const validationError = verificationValidationError(
				params.verdict,
				params.summary,
				params.checks,
				params.defects,
			);
			if (validationError) {
				return {
					content: [{ type: "text" as const, text: validationError }],
					details: { accepted: false },
				};
			}

			const review: VerificationResult = {
				verdict: params.verdict,
				summary: params.summary.trim(),
				checks: params.checks,
				defects: params.defects,
				at: now(),
			};
			step.review = review;

			if (review.verdict === "pass") {
				step.status = "verified";
				state.phase = "awaiting-review";
				state.blockedReason = undefined;
				runtime.setPendingAction("announce-step-review");
				runtime.persist(ctx);
				return {
					content: [{
						type: "text" as const,
						text: `STEP VERIFIED: ${step.id}. ${step.title}\n${review.summary}`,
					}],
					details: { accepted: true, stepId: step.id, review },
					terminate: true,
				};
			}

			step.status = "pending";
			state.friction.push(...review.defects);
			state.stepRepairCycles += 1;
			if (state.stepRepairCycles > config.maxRepairCycles) {
				state.phase = "needs-attention";
				state.blockedReason = `Step ${step.id} failed verification after ${config.maxRepairCycles} repair cycles. ${review.summary}`;
				runtime.setPendingAction("announce-needs-attention");
			} else {
				state.phase = "executing";
				state.reviewFeedback = review.defects.join("\n");
				state.blockedReason = undefined;
				runtime.setPendingAction("start-step-repair");
			}
			runtime.persist(ctx);
			return {
				content: [{
					type: "text" as const,
					text:
						state.phase === "executing"
							? `Step verification failed. Starting repair ${state.stepRepairCycles}/${config.maxRepairCycles}.`
							: `Step verification failed. Goal needs attention after ${config.maxRepairCycles} repairs.`,
				}],
				details: { accepted: true, stepId: step.id, review, repairCycles: state.stepRepairCycles },
				terminate: true,
			};
		},
	});

	pi.registerTool({
		name: "submit_verification",
		label: "Submit verification",
		description: "Submit the independent verification verdict and supporting checks for the active goal.",
		parameters: VERIFICATION_PARAMETERS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = runtime.getState();
			const config = runtime.getConfig();
			if (state.phase !== "verifying") {
				return {
					content: [{ type: "text" as const, text: "Verification rejected: the goal is not in verification mode." }],
					details: { accepted: false },
				};
			}
			const sourceDrift = sourceDriftResult(state, ctx.cwd);
			if (sourceDrift) return sourceDrift;
			if (state.plan.some((step) => step.status !== "done")) {
				return {
					content: [{
						type: "text" as const,
						text: "Verification rejected: every plan step must be completed and approved first.",
					}],
					details: { accepted: false },
				};
			}

			const validationError = verificationValidationError(
				params.verdict,
				params.summary,
				params.checks,
				params.defects,
			);
			if (validationError) {
				return {
					content: [{ type: "text" as const, text: validationError }],
					details: { accepted: false },
				};
			}

			state.verification = {
				verdict: params.verdict,
				summary: params.summary,
				checks: params.checks,
				defects: params.defects,
				at: now(),
			};

			if (params.verdict === "pass") {
				const repo = repositoryIdentity(ctx.cwd);
				const files = changedFiles(ctx.cwd, state.startCommit);
				let memoryResult: ReturnType<typeof storeVerifiedEpisode> | undefined;
				let memoryWarning: string | undefined;
				if (config.memory.enabled) {
					try {
						memoryResult = storeVerifiedEpisode(
							{
								goalId: state.goalId,
								cwd: ctx.cwd,
								objective: state.objective,
								outcome: params.summary,
								findings: params.findings,
								friction: state.friction,
								openItems: state.openItems,
								files,
								evidence: params.checks.map((check) => `${check.name}: ${check.status} — ${check.evidence}`),
								verification: state.verification,
								sessionFiles: state.sessionFiles,
								startCommit: state.startCommit,
								endCommit: repo.commit,
							},
							config.memory,
						);
					} catch (error) {
						memoryWarning = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(
							`Goal verification passed, but episodic memory could not be written: ${memoryWarning}`,
							"warning",
						);
					}
				}
				state.phase = "complete";
				state.blockedReason = undefined;
				runtime.setPendingAction("announce-complete");
				runtime.persist(ctx);
				return {
					content: [{
						type: "text" as const,
						text: `VERIFIED COMPLETE: ${params.summary}${memoryResult ? `\nVerified memory: ${memoryResult.id}` : ""}${memoryWarning ? "\nMemory warning: the verified result was not persisted." : ""}`,
					}],
					details: {
						accepted: true,
						verification: state.verification,
						memory: memoryResult,
						memoryWarning,
					},
					terminate: true,
				};
			}

			state.friction.push(...params.defects);
			state.repairCycles += 1;
			if (state.repairCycles > config.maxRepairCycles) {
				state.phase = "needs-attention";
				state.blockedReason = `Verification failed after ${config.maxRepairCycles} repair cycles. ${params.summary}`;
				runtime.setPendingAction("announce-needs-attention");
			} else {
				state.phase = "executing";
				state.blockedReason = undefined;
				runtime.setPendingAction("start-repair");
			}
			runtime.persist(ctx);

			return {
				content: [
					{
						type: "text" as const,
						text:
							state.phase === "executing"
								? `Verification failed. Starting repair cycle ${state.repairCycles}/${config.maxRepairCycles}.`
								: `Verification failed. Goal needs attention after ${config.maxRepairCycles} repair cycles.`,
					},
				],
				details: { accepted: true, verification: state.verification, repairCycles: state.repairCycles },
				terminate: true,
			};
		},
	});
}
