import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	configuredModels,
	formatConfig,
	GOALA_SETUP_PRESETS,
	loadConfig,
	writeConfig,
	type GoalaConfig,
	type ModelProfile,
	type ReviewPolicy,
	type ThinkingLevel,
} from "./config.ts";
import { buildPhaseContext } from "./context.ts";
import {
	memoryHealth,
	newGoalId,
	recentMemories,
	repositoryIdentity,
	searchMemories,
	setMemoryStatus,
} from "./memory.ts";
import {
	displayPlan,
	displayStatus,
	formatPlanForReview,
	formatState,
	registerPresenters,
	truncate,
	updateGoalUi,
} from "./presenters.ts";
import { enforceToolPolicy } from "./policy.ts";
import {
	findRecoverableGoals,
	formatRecoveryStatus,
} from "./recovery.ts";
import {
	moveToFreshSession,
	slicePhaseContext,
} from "./session.ts";
import { selectModelRoles } from "./setup.ts";
import {
	formatSourceDrift,
	inspectGoalSources,
	parseGoalRequest,
	resolveGoalSources,
	type GoalSource,
} from "./sources.ts";
import {
	GOALA_TOOLS,
	registerGoalaTools,
	toolsForPhase,
	type PendingAction,
} from "./tools.ts";
import {
	emptyState,
	GOAL_STATE_ENTRY,
	normalizeState,
	type GoalState,
} from "./workflow.ts";

function now(): string {
	return new Date().toISOString();
}

export { formatPlanForReview } from "./presenters.ts";

export default function goala(pi: ExtensionAPI): void {
	let config = loadConfig();
	let state = emptyState();
	let pendingAction: PendingAction | undefined;
	let sessionDefaultModel:
		| { provider: string; id: string; thinkingLevel?: ThinkingLevel }
		| undefined;
	let baselineTools: string[] = [];
	let fallbackNoticeShown = false;

	registerPresenters(pi);

	function persist(ctx?: ExtensionContext): void {
		state.updatedAt = now();
		pi.appendEntry(GOAL_STATE_ENTRY, structuredClone(state));
		if (ctx) updateGoalUi(ctx, state);
	}

	function restore(ctx: ExtensionContext): void {
		const entry = [...ctx.sessionManager.getBranch()]
			.reverse()
			.find(
				(item: { type: string; customType?: string }) =>
					item.type === "custom" && item.customType === GOAL_STATE_ENTRY,
		) as { data?: GoalState } | undefined;
		state = normalizeState(entry?.data);
		pendingAction = undefined;
		updateGoalUi(ctx, state);
	}

	function displayPlanForReview(): void {
		displayPlan(pi, state);
	}

	function profileForPhase(): ModelProfile {
		if (
			state.phase === "planning" ||
			state.phase === "awaiting-execution" ||
			state.phase === "awaiting-review"
		) return config.planner;
		if (state.phase === "verifying-step") return config.stepVerifier;
		if (state.phase === "verifying") return config.verifier;
		if (
			state.phase === "executing" &&
			state.repairCycles >= config.fallbackExecutor.afterRepairCycle
		) {
			return config.fallbackExecutor;
		}
		return config.executor;
	}

	async function statusForSession(
		ctx: ExtensionCommandContext,
	): Promise<string> {
		if (state.phase !== "idle") return formatState(state);
		const recoverable = await findRecoverableGoals(
			ctx.cwd,
			ctx.sessionManager.getSessionDir(),
		);
		return formatRecoveryStatus(recoverable);
	}

	async function applyPhase(ctx: ExtensionContext): Promise<boolean> {
		const validTools = new Set(pi.getAllTools().map((tool) => tool.name));
		pi.setActiveTools(toolsForPhase(state.phase, baselineTools).filter((tool) => validTools.has(tool)));
		if (
			state.phase === "idle" ||
			state.phase === "paused" ||
			state.phase === "needs-attention" ||
			state.phase === "complete"
		) {
			updateGoalUi(ctx, state);
			return true;
		}

		const profile = profileForPhase();
		let model = ctx.modelRegistry.find(profile.provider, profile.model);
		if (!model && config.allowCurrentModelFallback) {
			const fallback = sessionDefaultModel ?? (ctx.model
				? { provider: ctx.model.provider, id: ctx.model.id }
				: undefined);
			if (fallback) {
				model = ctx.modelRegistry.find(fallback.provider, fallback.id);
				if (model && !fallbackNoticeShown) {
					ctx.ui.notify(
						`Goala: ${profile.provider}/${profile.model} is unavailable; using ${fallback.provider}/${fallback.id}. Run /goala-setup to configure model roles.`,
						"warning",
					);
					fallbackNoticeShown = true;
				}
			}
		}
		if (!model) {
			ctx.ui.notify(
				`Goala: model not found: ${profile.provider}/${profile.model}. Run /goala-setup current or edit the namespaced config.`,
				"error",
			);
			updateGoalUi(ctx, state);
			return false;
		}

		const selected = await pi.setModel(model);
		if (!selected) {
			ctx.ui.notify(
				`Goala: authenticate ${profile.provider} before using ${profile.model}`,
				"warning",
			);
			updateGoalUi(ctx, state);
			return false;
		}
		pi.setThinkingLevel(profile.thinkingLevel);
		updateGoalUi(ctx, state);
		return true;
	}

	async function restoreSessionDefaults(ctx: ExtensionContext): Promise<void> {
		const validTools = new Set(pi.getAllTools().map((tool) => tool.name));
		pi.setActiveTools(baselineTools.filter((tool) => validTools.has(tool)));
		if (!sessionDefaultModel) return;
		const model = ctx.modelRegistry.find(sessionDefaultModel.provider, sessionDefaultModel.id);
		if (!model) return;
		if (await pi.setModel(model)) {
			if (sessionDefaultModel.thinkingLevel) {
				pi.setThinkingLevel(sessionDefaultModel.thinkingLevel);
			}
		}
	}

	function planningPrompt(extra?: string): string {
		return `[GOALA PHASE:PLANNING]\nInspect the active goal and repository, then submit a structured, testable plan with submit_plan.
Make each step a meaningful, independently reviewable milestone rather than a micro-task or a final-check-only step.${extra ? `\n\nRefinement requested:\n${extra}` : ""}`;
	}

	function executionPrompt(): string {
		const remaining = state.plan.filter((step) => step.status !== "done");
		const current = remaining[0];
		const repairNote =
			state.verification?.verdict === "fail"
				? `\n\nRepair the verifier's defects before resubmitting:\n${state.verification.defects.map((defect) => `- ${defect}`).join("\n")}`
				: "";
		const reviewNote = state.reviewFeedback
			? `\n\nThe user returned this step for revision:\n${state.reviewFeedback}`
			: "";
		if (
			state.reviewPolicy === "per-step" &&
			state.verification?.verdict !== "fail" &&
			current
		) {
			return `[GOALA PHASE:EXECUTING]\nImplement only plan step ${current.id}: ${current.title}.
Do not begin later plan steps. Run the step's declared checks, then call goal_progress complete_step with concrete evidence. Goala will pause for human review before continuing.${reviewNote}`;
		}
		return `[GOALA PHASE:EXECUTING]\nImplement the approved plan, starting with: ${current?.title ?? "repair the verified defects"}.
Record completed steps with goal_progress. When implementation checks pass, submit ready_for_verification.${repairNote}${reviewNote}`;
	}

	function verificationPrompt(): string {
		return `[GOALA PHASE:VERIFYING]
Independently verify the actual result against every acceptance criterion, then submit_verification with concrete evidence.
Include only distilled decisions, discoveries, or pitfalls that you personally confirmed from current files or checks in findings. Use an empty findings array when nothing is likely to help a later related task.`;
	}

	function stepVerificationPrompt(): string {
		const step = state.plan.find((candidate) => candidate.status === "implemented");
		return `[GOALA PHASE:STEP-VERIFYING]\nIndependently verify only plan step ${step?.id ?? "unknown"}: ${step?.title ?? "unknown step"}.
Required method: ${step?.verification ?? "Inspect the actual result and run relevant checks."}
Do not edit files or rely on executor claims. Finish with submit_step_verification and concrete evidence.`;
	}

	async function beginGoal(
		objective: string,
		sources: GoalSource[],
		ctx: ExtensionContext,
	): Promise<void> {
		const repo = repositoryIdentity(ctx.cwd);
		const recalledMemories =
			config.memory.enabled && config.memory.autoRecall
				? searchMemories(objective, ctx.cwd, config.memory)
				: [];
		state = {
			...emptyState(config.reviewPolicy),
			goalId: newGoalId(),
			objective,
			sources,
			phase: "planning",
			startedAt: now(),
			startCommit: repo.commit,
			recalledMemories,
		};
		pendingAction = undefined;
		pi.setSessionName(`Goal: ${truncate(objective, 56)}`);
		persist(ctx);
		const kickoff = planningPrompt();
		if (await moveToFreshSession(ctx, config, state, kickoff, "plan")) return;
		await applyPhase(ctx);
		pi.sendUserMessage(kickoff);
	}

	function requestedGoal(input: string, ctx: ExtensionContext): {
		objective: string;
		sources: GoalSource[];
	} | undefined {
		try {
			const request = parseGoalRequest(input);
			if (!request.objective) {
				ctx.ui.notify("Usage: /goal <objective>", "warning");
				return;
			}
			return {
				objective: request.objective,
				sources: resolveGoalSources(ctx.cwd, request.sourcePaths),
			};
		} catch (error) {
			ctx.ui.notify(
				error instanceof Error ? error.message : String(error),
				"warning",
			);
		}
	}

	async function confirmGoalReplacement(ctx: ExtensionContext): Promise<boolean> {
		if (state.phase === "idle" || state.phase === "complete") return true;
		if (!ctx.hasUI) {
			ctx.ui.notify("An active goal already exists. Run /goal clear before replacing it.", "warning");
			return false;
		}
		return ctx.ui.confirm(
			"Replace active goal?",
			"This discards the current structured goal state. Repository changes are not reverted.",
		);
	}

	async function startExecution(
		ctx: ExtensionContext,
		reviewPolicy: ReviewPolicy = state.reviewPolicy,
	): Promise<void> {
		if (state.plan.length === 0) {
			ctx.ui.notify("No approved plan exists. Run /plan first.", "warning");
			return;
		}
		if (state.phase !== "awaiting-execution") {
			ctx.ui.notify(`The plan cannot start from phase ${state.phase}.`, "warning");
			return;
		}
		state.reviewPolicy = reviewPolicy;
		state.phase = "executing";
		state.blockedReason = undefined;
		pendingAction = undefined;
		persist(ctx);
		const kickoff = executionPrompt();
		if (await moveToFreshSession(ctx, config, state, kickoff, "execute")) return;
		await applyPhase(ctx);
		pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
	}

	async function startVerification(ctx: ExtensionContext, allowFreshSession = true): Promise<void> {
		state.phase = "verifying";
		pendingAction = undefined;
		persist(ctx);
		const kickoff = verificationPrompt();
		if (allowFreshSession && await moveToFreshSession(ctx, config, state, kickoff, "verify")) return;
		await applyPhase(ctx);
		pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
	}

	async function startStepVerification(ctx: ExtensionContext, allowFreshSession = true): Promise<void> {
		const step = state.plan.find((candidate) => candidate.status === "implemented");
		if (!step) {
			ctx.ui.notify("No implemented step is waiting for verification.", "warning");
			return;
		}
		state.phase = "verifying-step";
		pendingAction = undefined;
		persist(ctx);
		const kickoff = stepVerificationPrompt();
		if (
			allowFreshSession &&
			await moveToFreshSession(ctx, config, state, kickoff, `verify-step-${step.id}`)
		) return;
		await applyPhase(ctx);
		pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
	}

	async function approveReviewedStep(ctx: ExtensionContext): Promise<void> {
		if (state.phase !== "awaiting-review") {
			ctx.ui.notify("No completed step is awaiting human approval.", "warning");
			return;
		}
		const step = state.plan.find(
			(candidate) => candidate.status === "implemented" || candidate.status === "verified",
		);
		if (!step?.evidence?.trim()) {
			ctx.ui.notify("The current step has no concrete validation evidence.", "warning");
			return;
		}
		if (step.review && step.review.verdict !== "pass") {
			ctx.ui.notify("The current step's independent review has not passed.", "warning");
			return;
		}
		step.status = "done";
		state.stepRepairCycles = 0;
		state.reviewFeedback = undefined;
		state.blockedReason = undefined;

		const next = state.plan.find((candidate) => candidate.status !== "done");
		if (next) {
			state.phase = "awaiting-execution";
			persist(ctx);
			await startExecution(ctx, "per-step");
			return;
		}

		persist(ctx);
		if (config.autoVerify) {
			await startVerification(ctx);
			return;
		}
		state.phase = "verifying";
		persist(ctx);
		await applyPhase(ctx);
		ctx.ui.notify("All steps are approved. Run /verify for final goal verification.", "info");
	}

	async function reviseReviewedStep(feedback: string, ctx: ExtensionContext): Promise<void> {
		if (state.phase !== "awaiting-review") {
			ctx.ui.notify("No completed step is awaiting revision.", "warning");
			return;
		}
		const step = state.plan.find(
			(candidate) => candidate.status === "implemented" || candidate.status === "verified",
		);
		if (!step) {
			ctx.ui.notify("No reviewed step was found.", "warning");
			return;
		}
		if (!feedback.trim()) {
			ctx.ui.notify("Usage: /goal revise <feedback for the executor>", "warning");
			return;
		}
		step.status = "pending";
		state.reviewFeedback = feedback.trim().slice(0, 4000);
		state.phase = "awaiting-execution";
		state.blockedReason = undefined;
		persist(ctx);
		await startExecution(ctx, "per-step");
	}







	registerGoalaTools(pi, {
		getState: () => state,
		getConfig: () => config,
		setPendingAction: (action) => {
			pendingAction = action;
		},
		persist,
		applyPhase,
		displayPlanForReview,
	});

	pi.registerCommand("goal", {
		description: "Start or manage a persistent goal; use --source <path> -- <objective> for authoritative documents",
		handler: async (args, ctx) => {
			const input = args.trim();
			const command = input.toLowerCase();

			if (!input || command === "status") {
				displayStatus(pi, await statusForSession(ctx));
				return;
			}
			if (command === "approve") {
				await approveReviewedStep(ctx);
				return;
			}
			if (command === "revise" || command.startsWith("revise ")) {
				await reviseReviewedStep(input.slice("revise".length).trim(), ctx);
				return;
			}
			if (command === "clear") {
				const cleared = state;
				state = {
					...emptyState(),
					goalId: cleared.goalId,
					objective: cleared.objective,
					startedAt: cleared.startedAt,
				};
				pendingAction = undefined;
				persist(ctx);
				await applyPhase(ctx);
				await restoreSessionDefaults(ctx);
				ctx.ui.notify("Goal cleared. Normal coding mode restored.", "info");
				return;
			}
			if (command === "pause") {
				if (state.phase === "idle" || state.phase === "complete") {
					ctx.ui.notify("There is no active goal to pause.", "warning");
					return;
				}
				state.pausedFrom = state.phase;
				state.phase = "paused";
				pendingAction = undefined;
				persist(ctx);
				await applyPhase(ctx);
				await restoreSessionDefaults(ctx);
				ctx.ui.notify("Goal paused. State has been preserved.", "info");
				return;
			}
			if (command === "resume") {
				if (state.phase !== "paused" && state.phase !== "needs-attention") {
					ctx.ui.notify("The goal is not paused or waiting for attention.", "warning");
					return;
				}
				const resumePhase =
					state.phase === "paused" && state.pausedFrom && state.pausedFrom !== "paused"
						? state.pausedFrom
						: state.plan.length === 0
							? "planning"
							: "executing";
				state.pausedFrom = undefined;
				state.blockedReason = undefined;

				if (resumePhase === "awaiting-execution" || resumePhase === "awaiting-review") {
					state.phase = resumePhase;
					persist(ctx);
					await applyPhase(ctx);
					ctx.ui.notify(
						resumePhase === "awaiting-review"
							? "Goal resumed at the human review checkpoint."
							: "Goal resumed with its plan awaiting execution approval.",
						"info",
					);
				} else if (resumePhase === "verifying-step") {
					state.phase = "verifying-step";
					persist(ctx);
					await startStepVerification(ctx);
				} else if (resumePhase === "verifying") {
					state.phase = "verifying";
					persist(ctx);
					await startVerification(ctx);
				} else if (resumePhase === "planning" || state.plan.length === 0) {
					state.phase = "planning";
					persist(ctx);
					const kickoff = planningPrompt("Resume planning the preserved goal.");
					if (await moveToFreshSession(ctx, config, state, kickoff, "plan-resume")) return;
					await applyPhase(ctx);
					pi.sendUserMessage(kickoff);
				} else {
					state.phase = "executing";
					persist(ctx);
					const kickoff = executionPrompt();
					if (await moveToFreshSession(ctx, config, state, kickoff, "execute-resume")) return;
					await applyPhase(ctx);
					pi.sendUserMessage(kickoff);
				}
				return;
			}

			const request = requestedGoal(input, ctx);
			if (request && await confirmGoalReplacement(ctx)) {
				await beginGoal(request.objective, request.sources, ctx);
			}
		},
	});

	pi.registerCommand("goal-status", {
		description: "Show the active goal or find a recoverable goal for this project",
		handler: async (_args, ctx) => displayStatus(pi, await statusForSession(ctx)),
	});

	pi.registerCommand("goal-plan", {
		description: "Show the complete goal plan, acceptance criteria, risks, and verification methods",
		handler: async (_args, ctx) => {
			if (state.phase === "idle" || !state.objective) {
				ctx.ui.notify("There is no active goal. Run /goal <objective> first.", "warning");
				return;
			}
			if (state.plan.length === 0) {
				ctx.ui.notify("The active goal does not have a submitted plan yet. Finish planning, then run /goal-plan again.", "warning");
				return;
			}
			displayPlanForReview();
		},
	});

	async function configureGoala(
		args: string,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		let choice = args.trim().toLowerCase();
		if (!choice && ctx.hasUI) {
			const selected = await ctx.ui.select("Goala setup", [
				...GOALA_SETUP_PRESETS.map((preset) => preset.label),
				"Configure each phase",
				"Show current configuration",
			]);
			choice = selected === "Show current configuration"
				? "status"
				: selected === "Configure each phase"
					? "custom"
				: GOALA_SETUP_PRESETS.find((preset) => preset.label === selected)?.id ?? "";
		}

		if (!choice || choice === "status") {
			ctx.ui.notify(formatConfig(config), "info");
			return;
		}

		let proposed: GoalaConfig | undefined;
		if (choice === "custom") {
			proposed = await selectModelRoles(ctx, config);
			if (!proposed) return;
		} else {
			const preset = GOALA_SETUP_PRESETS.find((candidate) => candidate.id === choice);
			if (!preset) {
				ctx.ui.notify(
					`Usage: /goala-setup [status | custom | ${GOALA_SETUP_PRESETS.map((candidate) => candidate.id).join(" | ")}]`,
					"warning",
				);
				return;
			}
			const current = ctx.model
				? { provider: ctx.model.provider, id: ctx.model.id }
				: sessionDefaultModel;
			proposed = preset.create(current);
			if (!proposed) {
				ctx.ui.notify(`Preset "${preset.label}" requires a current model.`, "warning");
				return;
			}
		}
		const missing = configuredModels(proposed).filter(
			(model) => !ctx.modelRegistry.find(model.provider, model.id),
		);
		if (missing.length > 0) {
			ctx.ui.notify(
				`Preset not saved; unavailable model(s): ${missing.map((model) => `${model.provider}/${model.id}`).join(", ")}.`,
				"warning",
			);
			return;
		}
		config = proposed;

		const target = writeConfig(config);
		fallbackNoticeShown = false;
		await applyPhase(ctx);
		ctx.ui.notify(`Goala configuration saved to ${target}\n\n${formatConfig(config)}`, "info");
	}

	pi.registerCommand("goala-setup", {
		description: `Configure model roles: /goala-setup [status | custom | ${GOALA_SETUP_PRESETS.map((preset) => preset.id).join(" | ")}]`,
		handler: configureGoala,
	});

	pi.registerCommand("memory-status", {
		description: "Show memory health and recent active episodes",
		handler: async (_args, ctx) => {
			if (!config.memory.enabled) {
				ctx.ui.notify("Goala memory is disabled in the namespaced configuration.", "info");
				return;
			}
			const memories = recentMemories(ctx.cwd, 20, true);
			const health = memoryHealth();
			const lines = memories.map(
				(memory) =>
					`${memory.id} · ${memory.status ?? "verified"} · ${memory.learnings.length} findings · ${truncate(memory.intent, 52)} · ${memory.repoKey} · ${memory.provenance ?? "unknown"} · ${memory.verifiedAt.slice(0, 10)}`,
			);
			ctx.ui.notify(
				[
					`Memory: ${health.ok ? "healthy" : "attention needed"} · ${health.verified} active · ${health.retired} retired`,
					`Database: ${health.database}`,
					health.lastError ? `Last error: ${health.lastError}` : "",
					lines.length > 0
						? `Recent episodes:\n${lines.join("\n")}`
						: "No verified or retired episodes are stored.",
				].filter(Boolean).join("\n"),
				health.ok ? "info" : "warning",
			);
		},
	});

	pi.registerCommand("memory", {
		description: "Retire or restore a durable memory episode",
		handler: async (args, ctx) => {
			if (!config.memory.enabled) {
				ctx.ui.notify("Goala memory is disabled in the namespaced configuration.", "info");
				return;
			}
			const [action, id, ...extra] = args.trim().split(/\s+/);
			if (
				extra.length > 0 ||
				(action !== "retire" && action !== "restore") ||
				!id
			) {
				ctx.ui.notify("Usage: /memory retire <memory-id> or /memory restore <memory-id>", "warning");
				return;
			}
			const status = action === "retire" ? "retired" : "verified";
			if (!setMemoryStatus(id, status)) {
				ctx.ui.notify(`Memory ${id} was not found or could not be updated. Run /memory-status for diagnostics.`, "warning");
				return;
			}
			ctx.ui.notify(
				`Memory ${id} is now ${status}. ${status === "retired" ? "It will no longer be recalled." : "It can be recalled again."}`,
				"info",
			);
		},
	});

	pi.registerCommand("plan", {
		description: "Start planning, or explicitly replace a progressed plan with /plan --replace",
		handler: async (args, ctx) => {
			const argument = args.trim();
			const replace = argument === "--replace";
			const objective = replace ? state.objective : argument || state.objective;
			if (!objective) {
				ctx.ui.notify("Usage: /goal <objective> or /plan <objective>", "warning");
				return;
			}
			if (argument && !replace) {
				const request = requestedGoal(argument, ctx);
				if (request && await confirmGoalReplacement(ctx)) {
					await beginGoal(request.objective, request.sources, ctx);
				}
				return;
			}
			const hasProgress = state.plan.some(
				(step) => step.status !== "pending" || Boolean(step.evidence) || Boolean(step.review),
			);
			if (hasProgress && !replace) {
				ctx.ui.notify(
					"The plan has progress or review evidence. Use /plan --replace to discard that structured history.",
					"warning",
				);
				return;
			}
			state.phase = "planning";
			state.plan = [];
			state.acceptanceCriteria = [];
			state.risks = [];
			state.verification = undefined;
			state.blockedReason = undefined;
			state.repairCycles = 0;
			pendingAction = undefined;
			persist(ctx);
			const kickoff = planningPrompt("Re-plan the goal from the current repository state.");
			if (await moveToFreshSession(ctx, config, state, kickoff, "replan")) return;
			await applyPhase(ctx);
			pi.sendUserMessage(kickoff);
		},
	});

	pi.registerCommand("execute", {
		description: "Approve and execute the plan: /execute [final | per-step]",
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (requested && requested !== "final" && requested !== "per-step") {
				ctx.ui.notify("Usage: /execute [final | per-step]", "warning");
				return;
			}
			const reviewPolicy: ReviewPolicy =
				requested === "per-step" || requested === "final"
					? requested
					: config.reviewPolicy;
			await startExecution(ctx, reviewPolicy);
		},
	});

	pi.registerCommand("verify", {
		description: "Run optional step verification at a checkpoint, or final goal verification",
		handler: async (_args, ctx) => {
			if (!state.objective || state.plan.length === 0) {
				ctx.ui.notify("There is no planned goal to verify.", "warning");
				return;
			}
			if (state.phase === "verifying-step") {
				await startStepVerification(ctx);
				return;
			}
			if (state.phase === "awaiting-review") {
				const implemented = state.plan.find((step) => step.status === "implemented");
				if (!implemented) {
					ctx.ui.notify("The current step has already passed independent verification.", "info");
					return;
				}
				await startStepVerification(ctx);
				return;
			}
			if (state.plan.some((step) => step.status !== "done")) {
				ctx.ui.notify("Final verification requires every plan step to be completed and approved.", "warning");
				return;
			}
			await startVerification(ctx);
		},
	});

	pi.on("tool_call", async (event, ctx) => enforceToolPolicy(state.phase, event, ctx));

	pi.on("before_agent_start", async (event, ctx) => {
		if (state.phase === "idle") return;
		const sourceDrift = formatSourceDrift(
			inspectGoalSources(ctx.cwd, state.sources),
		);

		let phaseInstructions = "";
		switch (state.phase) {
			case "planning":
				phaseInstructions = `You are the PLANNER. Use read-only exploration only. Do not edit, install, commit, or change external state.
Resolve uncertainty by inspecting the repository. State material assumptions and risks.
Read every authoritative goal source in the phase context and cover its requirements in the acceptance criteria and plan.
Make plan steps meaningful, independently reviewable milestones; do not create micro-steps or a separate step whose only purpose is final regression checking.
Use recalled memory only as leads; confirm it against current files. Use memory_search for targeted history.
Your final action must be submit_plan with a structured, testable plan.`;
				break;
			case "awaiting-execution":
				phaseInstructions = "The structured plan is awaiting user approval. Do not begin implementation.";
				break;
			case "executing":
				phaseInstructions =
					state.reviewPolicy === "per-step" && state.verification?.verdict !== "fail"
					? `You are the EXECUTOR. Implement only the first unapproved plan step shown in the phase context, or report a real blocker.
Read the current authoritative goal sources before implementation and preserve their acceptance contract.
Do not begin later steps. Use goal_progress complete_step with concrete evidence when this step's checks pass.
Use memory_search only when prior work is relevant.`
					: `You are the EXECUTOR. Continue until the approved plan is implemented or a real blocker requires user input.
Read the current authoritative goal sources before implementation and preserve their acceptance contract.
Use goal_progress to record evidence for completed steps. Do not self-certify the goal.
Use memory_search only when prior work is relevant.
After all implementation work and checks are complete, submit ready_for_verification.`;
				break;
			case "verifying-step":
				phaseInstructions = `You are the independent STEP VERIFIER. Verify only the implemented plan step identified in the phase context.
Read the authoritative goal sources and check the step against their current requirements.
Do not edit files. Treat executor evidence as untrusted and inspect the actual repository.
Your final action must be submit_step_verification. PASS requires concrete passing evidence for the step's verification method.`;
				break;
			case "awaiting-review":
				phaseInstructions = `The completed step is awaiting human approval. Discuss its implementation, executor validation evidence, and tradeoffs using read-only inspection.
Use the authoritative goal sources as the requirements reference.
Do not edit or advance the plan. The user can run /goal approve, /goal revise <feedback>, or /verify for an optional independent step review.`;
				break;
			case "verifying":
				phaseInstructions = `You are the independent VERIFIER. Treat prior completion claims as untrusted.
Read every authoritative goal source and independently verify the result against its current requirements as well as the structured acceptance criteria.
Do not edit files. Inspect actual changes and run relevant validation.
Your final action must be submit_verification. PASS requires concrete passing evidence for every acceptance criterion.
The findings field is the only learning path into durable episodic memory. Include only concise future-useful decisions, discoveries, or pitfalls that your own inspection confirmed, with evidence and an optional source path. Do not restate the goal or generic success. Return an empty findings array when there is no durable lesson.`;
				break;
			case "paused":
				phaseInstructions = "The goal is paused. Preserve it but do not advance it unless the user explicitly resumes.";
				break;
			case "needs-attention":
				phaseInstructions = "The goal needs user attention. Explain the blocker concisely; do not claim completion.";
				break;
			case "complete":
				phaseInstructions = "The goal is verified complete. Do not reopen it unless the user explicitly asks.";
				break;
		}

		return {
			systemPrompt: `${event.systemPrompt}

## Goala
${phaseInstructions}

${buildPhaseContext(state, config.memory)}

${sourceDrift}`.trim(),
		};
	});

	pi.on("context", async (event) => {
		if (!config.freshSessionPerPhase) return;
		const messages = slicePhaseContext(event.messages, state.phase);
		if (messages) return { messages };
	});

	pi.on("agent_end", async (_event, ctx) => {
		const action = pendingAction;
		pendingAction = undefined;
		if (!action) return;

		if (action === "start-verification") {
			// Automatic phase changes happen inside the executor's replacement
			// session. Starting another physical session here can deadlock RPC/TUI
			// session replacement. The context hook below gives the verifier an
			// equivalent clean logical context in the current session.
			await startVerification(ctx, false);
			return;
		}
		if (action === "start-step-repair") {
			const kickoff = executionPrompt();
			await applyPhase(ctx);
			pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
			return;
		}
		if (action === "start-repair") {
			const kickoff = executionPrompt();
			await applyPhase(ctx);
			pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
			return;
		}
		if (action === "announce-step-review") {
			await restoreSessionDefaults(ctx);
			await applyPhase(ctx);
			updateGoalUi(ctx, state);
			const step = state.plan.find(
				(candidate) => candidate.status === "implemented" || candidate.status === "verified",
			);
			pi.sendMessage(
				{
					customType: "goala-step-review",
					content: `Step ready for review\n\n${step ? `${step.id}. ${step.title}\n${step.review?.summary ?? step.evidence ?? ""}` : formatState(state)}\n\nDiscuss the result, then run /goal approve or /goal revise <feedback>. Run /verify first when an independent step review is warranted.`,
					display: true,
				},
				{ triggerTurn: false },
			);
			return;
		}
		if (action === "announce-complete") {
			await restoreSessionDefaults(ctx);
			updateGoalUi(ctx, state);
			pi.sendMessage(
				{
					customType: "goala-complete",
					content: `✓ Verified complete\n\n${formatState(state)}`,
					display: true,
				},
				{ triggerTurn: false },
			);
			return;
		}
		if (action === "announce-needs-attention") {
			await restoreSessionDefaults(ctx);
			updateGoalUi(ctx, state);
			pi.sendMessage(
				{
					customType: "goala-attention",
					content: `Goal needs attention\n\n${formatState(state)}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (baselineTools.length === 0) {
			baselineTools = pi.getActiveTools().filter((tool) => !GOALA_TOOLS.has(tool));
		}
		if (!sessionDefaultModel && ctx.model) {
			sessionDefaultModel = {
				provider: ctx.model.provider,
				id: ctx.model.id,
				thinkingLevel: ctx.thinkingLevel as ThinkingLevel | undefined,
			};
		}
		restore(ctx);
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (state.phase !== "idle" && sessionFile && !state.sessionFiles.includes(sessionFile)) {
			state.sessionFiles.push(sessionFile);
			persist(ctx);
		}
		await applyPhase(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restore(ctx);
		// State entries can move the session leaf while a tool-driven turn is
		// still active. Do not switch models mid-response (for example, from the
		// verifier to the default executor before its final answer).
		if (ctx.isIdle()) await applyPhase(ctx);
	});
}
