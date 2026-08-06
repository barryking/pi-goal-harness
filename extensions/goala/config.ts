import {
	chmodSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ReviewPolicy = "final" | "per-step";

export interface PiDefaultModelProfile {
	kind: "pi-default";
}

export interface FixedModelProfile {
	kind: "fixed";
	provider: string;
	model: string;
	thinkingLevel: ThinkingLevel;
}

export type ModelProfile = PiDefaultModelProfile | FixedModelProfile;

export interface ModelIdentity {
	provider: string;
	id: string;
}

export interface GoalaSetupPreset {
	id: string;
	label: string;
	create(): GoalaConfig;
}

export interface GoalaConfig {
	configVersion: 4;
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
}

const PI_DEFAULT_PROFILE: PiDefaultModelProfile = { kind: "pi-default" };

export const PI_DEFAULT_CONFIG: GoalaConfig = {
	configVersion: 4,
	planner: { ...PI_DEFAULT_PROFILE },
	executor: { ...PI_DEFAULT_PROFILE },
	fallbackExecutor: { ...PI_DEFAULT_PROFILE, afterRepairCycle: 2 },
	stepVerifier: { ...PI_DEFAULT_PROFILE },
	verifier: { ...PI_DEFAULT_PROFILE },
	reviewPolicy: "final",
	autoVerify: true,
	maxRepairCycles: 3,
	freshSessionPerPhase: true,
	allowCurrentModelFallback: true,
};

export function goalaHome(): string {
	return process.env.PI_GOALA_HOME || join(getAgentDir(), "pi-goala");
}

export function configPath(): string {
	return join(goalaHome(), "config.json");
}

type PersistedConfig = Record<string, unknown> & {
	provider?: unknown;
	memory?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
		value as string,
	);
}

function normalizeProfile(
	value: unknown,
	legacyProvider: unknown,
): ModelProfile {
	if (!isRecord(value)) return { ...PI_DEFAULT_PROFILE };
	if (value.kind === "pi-default") return { ...PI_DEFAULT_PROFILE };

	const provider = typeof value.provider === "string" && value.provider
		? value.provider
		: typeof legacyProvider === "string" && legacyProvider
			? legacyProvider
			: undefined;
	const model = typeof value.model === "string" && value.model
		? value.model
		: undefined;
	if (!provider || !model) return { ...PI_DEFAULT_PROFILE };

	return {
		kind: "fixed",
		provider,
		model,
		thinkingLevel: isThinkingLevel(value.thinkingLevel)
			? value.thinkingLevel
			: "medium",
	};
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: fallback;
}

function mergeConfig(parsed: PersistedConfig): GoalaConfig {
	const fallbackValue = isRecord(parsed.fallbackExecutor)
		? parsed.fallbackExecutor
		: undefined;
	return {
		configVersion: 4,
		planner: normalizeProfile(parsed.planner, parsed.provider),
		executor: normalizeProfile(parsed.executor, parsed.provider),
		fallbackExecutor: {
			...normalizeProfile(parsed.fallbackExecutor, parsed.provider),
			afterRepairCycle: positiveInteger(
				fallbackValue?.afterRepairCycle,
				PI_DEFAULT_CONFIG.fallbackExecutor.afterRepairCycle,
			),
		},
		stepVerifier: normalizeProfile(parsed.stepVerifier, parsed.provider),
		verifier: normalizeProfile(parsed.verifier, parsed.provider),
		reviewPolicy: parsed.reviewPolicy === "per-step" ? "per-step" : "final",
		autoVerify: booleanSetting(parsed.autoVerify, PI_DEFAULT_CONFIG.autoVerify),
		maxRepairCycles: positiveInteger(
			parsed.maxRepairCycles,
			PI_DEFAULT_CONFIG.maxRepairCycles,
		),
		freshSessionPerPhase: booleanSetting(
			parsed.freshSessionPerPhase,
			PI_DEFAULT_CONFIG.freshSessionPerPhase,
		),
		allowCurrentModelFallback: booleanSetting(
			parsed.allowCurrentModelFallback,
			PI_DEFAULT_CONFIG.allowCurrentModelFallback,
		),
	};
}

export function loadConfig(): GoalaConfig {
	let config: GoalaConfig;
	try {
		const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as PersistedConfig;
		config = mergeConfig(parsed);
	} catch {
		config = mergeConfig({});
	}

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

export function fixedModelConfig(
	provider: string,
	model: string,
	thinkingLevel: ThinkingLevel = "medium",
): GoalaConfig {
	const profile: FixedModelProfile = {
		kind: "fixed",
		provider,
		model,
		thinkingLevel,
	};
	return {
		...structuredClone(PI_DEFAULT_CONFIG),
		planner: { ...profile },
		executor: { ...profile },
		fallbackExecutor: { ...profile, afterRepairCycle: 2 },
		stepVerifier: { ...profile },
		verifier: { ...profile },
	};
}

function cloneConfig(config: GoalaConfig): GoalaConfig {
	return structuredClone(config);
}

export const GOALA_SETUP_PRESETS: readonly GoalaSetupPreset[] = [
	{
		id: "default",
		label: "Use Pi's default model for every role",
		create: () => cloneConfig(PI_DEFAULT_CONFIG),
	},
];

export function configuredModels(config: GoalaConfig): ModelIdentity[] {
	const identities = [
		config.planner,
		config.executor,
		config.fallbackExecutor,
		config.stepVerifier,
		config.verifier,
	].flatMap((profile) =>
		profile.kind === "fixed"
			? [{ provider: profile.provider, id: profile.model }]
			: [],
	);
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
		`Unavailable fixed-model fallback to Pi default: ${config.allowCurrentModelFallback ? "allowed" : "disabled"}`,
	].join("\n");
}

function formatProfile(profile: ModelProfile): string {
	if (profile.kind === "pi-default") {
		return "Pi default model · Pi reasoning setting (limited by model support)";
	}
	return `${profile.provider}/${profile.model} · ${profile.thinkingLevel} reasoning`;
}
