import {
	chmodSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { MemoryConfig } from "./memory.ts";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ReviewPolicy = "final" | "per-step";

export interface ModelProfile {
	provider: string;
	model: string;
	thinkingLevel: ThinkingLevel;
}

export interface ModelIdentity {
	provider: string;
	id: string;
}

export interface GoalaSetupPreset {
	id: string;
	label: string;
	create(currentModel?: ModelIdentity): GoalaConfig | undefined;
}

export interface GoalaConfig {
	configVersion: 2;
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

export const OPENAI_CODEX_PRESET: GoalaConfig = {
	configVersion: 2,
	planner: {
		provider: "openai-codex",
		model: "gpt-5.6-sol",
		thinkingLevel: "medium",
	},
	executor: {
		provider: "openai-codex",
		model: "gpt-5.6-luna",
		thinkingLevel: "medium",
	},
	fallbackExecutor: {
		provider: "openai-codex",
		model: "gpt-5.6-terra",
		thinkingLevel: "medium",
		afterRepairCycle: 2,
	},
	stepVerifier: {
		provider: "openai-codex",
		model: "gpt-5.6-luna",
		thinkingLevel: "medium",
	},
	verifier: {
		provider: "openai-codex",
		model: "gpt-5.6-sol",
		thinkingLevel: "medium",
	},
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

export function goalaHome(): string {
	return process.env.PI_GOALA_HOME || join(getAgentDir(), "pi-goala");
}

export function configPath(): string {
	return join(goalaHome(), "config.json");
}

type PersistedConfig = Partial<GoalaConfig> & {
	provider?: unknown;
};

function profileProvider(
	profile: Partial<ModelProfile> | undefined,
	legacyProvider: unknown,
	fallback: ModelProfile,
): string {
	if (typeof profile?.provider === "string" && profile.provider) return profile.provider;
	if (typeof legacyProvider === "string" && legacyProvider) return legacyProvider;
	return fallback.provider;
}

function mergeProfile(
	profile: Partial<ModelProfile> | undefined,
	legacyProvider: unknown,
	fallback: ModelProfile,
): ModelProfile {
	return {
		...fallback,
		...profile,
		provider: profileProvider(profile, legacyProvider, fallback),
	};
}

function mergeConfig(parsed: PersistedConfig): GoalaConfig {
	const { provider: legacyProvider, ...current } = parsed;
	return {
		...OPENAI_CODEX_PRESET,
		...current,
		configVersion: 2,
		reviewPolicy: parsed.reviewPolicy === "per-step" ? "per-step" : "final",
		planner: mergeProfile(
			parsed.planner,
			legacyProvider,
			OPENAI_CODEX_PRESET.planner,
		),
		executor: mergeProfile(
			parsed.executor,
			legacyProvider,
			OPENAI_CODEX_PRESET.executor,
		),
		fallbackExecutor: {
			...mergeProfile(
				parsed.fallbackExecutor,
				legacyProvider,
				OPENAI_CODEX_PRESET.fallbackExecutor,
			),
			afterRepairCycle:
				parsed.fallbackExecutor?.afterRepairCycle ??
				OPENAI_CODEX_PRESET.fallbackExecutor.afterRepairCycle,
		},
		stepVerifier: mergeProfile(
			parsed.stepVerifier,
			legacyProvider,
			OPENAI_CODEX_PRESET.stepVerifier,
		),
		verifier: mergeProfile(
			parsed.verifier,
			legacyProvider,
			OPENAI_CODEX_PRESET.verifier,
		),
		memory: { ...OPENAI_CODEX_PRESET.memory, ...parsed.memory },
	};
}

export function loadConfig(): GoalaConfig {
	let config = OPENAI_CODEX_PRESET;
	try {
		const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as PersistedConfig;
		config = mergeConfig(parsed);
	} catch {
		config = mergeConfig({});
	}

	const memoryEnabled = process.env.PI_GOALA_MEMORY_ENABLED;
	if (memoryEnabled === "0") config.memory.enabled = false;
	if (memoryEnabled === "1") config.memory.enabled = true;
	const freshSessions = process.env.PI_GOALA_FRESH_SESSIONS;
	if (freshSessions === "0") config.freshSessionPerPhase = false;
	if (freshSessions === "1") config.freshSessionPerPhase = true;
	const reviewPolicy = process.env.PI_GOALA_REVIEW_POLICY;
	if (reviewPolicy === "final") config.reviewPolicy = "final";
	if (reviewPolicy === "per-step") config.reviewPolicy = "per-step";
	return config;
}

export function writeConfig(config: GoalaConfig): string {
	const home = goalaHome();
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
): GoalaConfig {
	return {
		...OPENAI_CODEX_PRESET,
		planner: { provider, model, thinkingLevel },
		executor: { provider, model, thinkingLevel },
		fallbackExecutor: { provider, model, thinkingLevel, afterRepairCycle: 2 },
		stepVerifier: { provider, model, thinkingLevel },
		verifier: { provider, model, thinkingLevel },
	};
}

function cloneConfig(config: GoalaConfig): GoalaConfig {
	return structuredClone(config);
}

export const GOALA_SETUP_PRESETS: readonly GoalaSetupPreset[] = [
	{
		id: "openai",
		label: "Recommended OpenAI Codex preset",
		create: () => cloneConfig(OPENAI_CODEX_PRESET),
	},
	{
		id: "current",
		label: "Use the current model for every role",
		create: (currentModel) =>
			currentModel
				? currentModelConfig(currentModel.provider, currentModel.id)
				: undefined,
	},
];

export function configuredModels(config: GoalaConfig): ModelIdentity[] {
	const identities = [
		config.planner,
		config.executor,
		config.fallbackExecutor,
		config.stepVerifier,
		config.verifier,
	].map((profile) => ({ provider: profile.provider, id: profile.model }));
	return identities.filter(
		(identity, index) =>
			identities.findIndex(
				(candidate) =>
					candidate.provider === identity.provider && candidate.id === identity.id,
			) === index,
	);
}

export function formatConfig(config: GoalaConfig): string {
	return [
		`Config: ${configPath()}`,
		`Planner: ${formatProfile(config.planner)}`,
		`Executor: ${formatProfile(config.executor)}`,
		`Step verifier: ${formatProfile(config.stepVerifier)}`,
		`Verifier: ${formatProfile(config.verifier)}`,
		`Fallback executor: ${formatProfile(config.fallbackExecutor)}`,
		`Fallback executor activates after: ${config.fallbackExecutor.afterRepairCycle} failed verification attempts`,
		`Review policy: ${config.reviewPolicy}`,
		`Memory: ${config.memory.enabled ? "enabled" : "disabled"}; auto-recall ${config.memory.autoRecall ? "on" : "off"}`,
		`Unavailable-model fallback to current Pi model: ${config.allowCurrentModelFallback ? "allowed" : "disabled"}`,
	].join("\n");
}

function formatProfile(profile: ModelProfile): string {
	return `${profile.provider}/${profile.model} · ${profile.thinkingLevel} reasoning`;
}
