import type {
	GoalaConfig,
	ModelProfile,
} from "./config.ts";
import type { Phase } from "./workflow.ts";

export function modelProfileForPhase(
	config: GoalaConfig,
	phase: Phase,
	repairCycles: number,
): ModelProfile {
	if (
		phase === "planning" ||
		phase === "awaiting-execution" ||
		phase === "awaiting-review"
	) {
		return config.planner;
	}
	if (phase === "verifying-step") return config.stepVerifier;
	if (phase === "verifying") return config.verifier;
	if (
		phase === "executing" &&
		repairCycles >= config.fallbackExecutor.afterRepairCycle
	) {
		return config.fallbackExecutor;
	}
	return config.executor;
}
