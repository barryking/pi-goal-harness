import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { MemoryConfig } from "./memory.ts";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ReviewPolicy = "final" | "per-step";

export interface ModelProfile {
	model: string;
	thinkingLevel: ThinkingLevel;
}

export interface ModelIdentity {
	provider: string;
	id: string;
}

export interface HarnessSetupPreset {
	id: string;
	label: string;
	create(currentModel?: ModelIdentity): HarnessConfig | undefined;
}

export interface HarnessConfig {
	configVersion: 1;
	provider: string;
	planner: ModelProfile;
	executor: ModelProfile;
	fallbackExecutor: ModelProfile & { afterRepairCycle: number };
	stepVerifier: ModelProfile;
	verifier: ModelProfile;
	reviewPolicy: ReviewPolicy;
	autoVerify: boolean;
	maxRepairCycles: number;
	freshSessionPerPhase: boolean;
	allowCurrentModelFallback: boolean;
	memory: MemoryConfig;
}

export const OPENAI_CODEX_PRESET: HarnessConfig = {
	configVersion: 1,
	provider: "openai-codex",
	planner: { model: "gpt-5.6-sol", thinkingLevel: "medium" },
	executor: { model: "gpt-5.6-luna", thinkingLevel: "medium" },
	fallbackExecutor: { model: "gpt-5.6-terra", thinkingLevel: "medium", afterRepairCycle: 2 },
	stepVerifier: { model: "gpt-5.6-luna", thinkingLevel: "medium" },
	verifier: { model: "gpt-5.6-sol", thinkingLevel: "medium" },
	reviewPolicy: "final",
	autoVerify: true,
	maxRepairCycles: 3,
	freshSessionPerPhase: true,
	allowCurrentModelFallback: true,
	memory: {
		enabled: true,
		autoRecall: true,
		maxResults: 4,
		maxInjectedChars: 6000,
		maxResultChars: 900,
		storeColdEvidence: false,
	},
};

export function harnessHome(): string {
	return process.env.PI_GOAL_HARNESS_HOME || join(getAgentDir(), "pi-goal-harness");
}

export function configPath(): string {
	return join(harnessHome(), "config.json");
}

function mergeConfig(parsed: Partial<HarnessConfig>): HarnessConfig {
	return {
		...OPENAI_CODEX_PRESET,
		...parsed,
		configVersion: 1,
		reviewPolicy: parsed.reviewPolicy === "per-step" ? "per-step" : "final",
		planner: { ...OPENAI_CODEX_PRESET.planner, ...parsed.planner },
		executor: { ...OPENAI_CODEX_PRESET.executor, ...parsed.executor },
		fallbackExecutor: {
			...OPENAI_CODEX_PRESET.fallbackExecutor,
			...parsed.fallbackExecutor,
		},
		stepVerifier: { ...OPENAI_CODEX_PRESET.stepVerifier, ...parsed.stepVerifier },
		verifier: { ...OPENAI_CODEX_PRESET.verifier, ...parsed.verifier },
		memory: { ...OPENAI_CODEX_PRESET.memory, ...parsed.memory },
	};
}

export function loadConfig(): HarnessConfig {
	let config = OPENAI_CODEX_PRESET;
	try {
		const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<HarnessConfig>;
		config = mergeConfig(parsed);
	} catch {
		config = mergeConfig({});
	}

	if (process.env.PI_HARNESS_MEMORY_ENABLED === "0") config.memory.enabled = false;
	if (process.env.PI_HARNESS_MEMORY_ENABLED === "1") config.memory.enabled = true;
	if (process.env.PI_HARNESS_FRESH_SESSIONS === "0") config.freshSessionPerPhase = false;
	if (process.env.PI_HARNESS_FRESH_SESSIONS === "1") config.freshSessionPerPhase = true;
	if (process.env.PI_HARNESS_REVIEW_POLICY === "final") config.reviewPolicy = "final";
	if (process.env.PI_HARNESS_REVIEW_POLICY === "per-step") config.reviewPolicy = "per-step";
	return config;
}

export function writeConfig(config: HarnessConfig): string {
	const home = harnessHome();
	mkdirSync(home, { recursive: true, mode: 0o700 });
	const target = configPath();
	writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	chmodSync(target, 0o600);
	return target;
}

export function currentModelConfig(
	provider: string,
	model: string,
	thinkingLevel: ThinkingLevel = "medium",
): HarnessConfig {
	return {
		...OPENAI_CODEX_PRESET,
		provider,
		planner: { model, thinkingLevel },
		executor: { model, thinkingLevel },
		fallbackExecutor: { model, thinkingLevel, afterRepairCycle: 2 },
		stepVerifier: { model, thinkingLevel },
		verifier: { model, thinkingLevel },
	};
}

function cloneConfig(config: HarnessConfig): HarnessConfig {
	return structuredClone(config);
}

export const HARNESS_SETUP_PRESETS: readonly HarnessSetupPreset[] = [
	{
		id: "openai",
		label: "Recommended OpenAI Codex preset",
		create: () => cloneConfig(OPENAI_CODEX_PRESET),
	},
	{
		id: "current",
		label: "Use the current model for every phase",
		create: (currentModel) =>
			currentModel
				? currentModelConfig(currentModel.provider, currentModel.id)
				: undefined,
	},
];

export function configuredModels(config: HarnessConfig): ModelIdentity[] {
	const identities = [
		config.planner,
		config.executor,
		config.fallbackExecutor,
		config.stepVerifier,
		config.verifier,
	].map((profile) => ({ provider: config.provider, id: profile.model }));
	return identities.filter(
		(identity, index) =>
			identities.findIndex(
				(candidate) =>
					candidate.provider === identity.provider && candidate.id === identity.id,
			) === index,
	);
}

export function formatConfig(config: HarnessConfig): string {
	return [
		`Config: ${configPath()}`,
		`Planner: ${config.provider}/${config.planner.model}:${config.planner.thinkingLevel}`,
		`Executor: ${config.provider}/${config.executor.model}:${config.executor.thinkingLevel}`,
		`Step verifier: ${config.provider}/${config.stepVerifier.model}:${config.stepVerifier.thinkingLevel}`,
		`Verifier: ${config.provider}/${config.verifier.model}:${config.verifier.thinkingLevel}`,
		`Fallback: ${config.provider}/${config.fallbackExecutor.model}:${config.fallbackExecutor.thinkingLevel} from repair ${config.fallbackExecutor.afterRepairCycle}`,
		`Review policy: ${config.reviewPolicy}`,
		`Memory: ${config.memory.enabled ? "enabled" : "disabled"}; auto-recall ${config.memory.autoRecall ? "on" : "off"}`,
		`Current-model fallback: ${config.allowCurrentModelFallback ? "allowed" : "disabled"}`,
	].join("\n");
}
