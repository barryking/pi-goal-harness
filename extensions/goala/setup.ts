import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type {
	FixedModelProfile,
	GoalaConfig,
	ModelProfile,
	ThinkingLevel,
} from "./config.ts";
import {
	clampThinkingLevel,
	supportedThinkingLevels,
} from "./model-capabilities.ts";

type ModelRole =
	| "planner"
	| "executor"
	| "stepVerifier"
	| "verifier"
	| "fallbackExecutor";

type AvailableModel = ReturnType<
	ExtensionCommandContext["modelRegistry"]["getAvailable"]
>[number];

const MODEL_ROLES: ReadonlyArray<{ key: ModelRole; label: string }> = [
	{ key: "planner", label: "Planner" },
	{ key: "executor", label: "Executor" },
	{ key: "stepVerifier", label: "Step verifier" },
	{ key: "verifier", label: "Final verifier" },
	{ key: "fallbackExecutor", label: "Fallback executor" },
];

const KEEP_CURRENT = "Keep current";
const CHANGE_REASONING = "Change reasoning effort";
const CHANGE_MODEL = "Change provider or model";
const SAVE_CONFIGURATION = "Save configuration";
const EDIT_ROLE = "Edit a role";
const CANCEL = "Cancel";

function titleCase(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function thinkingLabel(level: ThinkingLevel): string {
	if (level === "off") return "Off";
	if (level === "xhigh") return "Extra high";
	if (level === "max") return "Maximum";
	return titleCase(level);
}

function providerLabel(
	ctx: ExtensionCommandContext,
	provider: string,
): string {
	const displayName = ctx.modelRegistry.getProviderDisplayName(provider);
	return displayName === provider ? provider : `${displayName} (${provider})`;
}

function modelLabel(model: AvailableModel): string {
	return model.name && model.name !== model.id
		? `${model.name} (${model.id})`
		: model.id;
}

function profileLabel(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	profile: ModelProfile,
): string {
	if (profile.kind === "pi-default") {
		return "Pi default model / Pi reasoning setting (limited by model support)";
	}
	const model = available.find(
		(candidate) =>
			candidate.provider === profile.provider && candidate.id === profile.model,
	);
	const reasoning =
		profile.thinkingLevel === "off"
			? "Reasoning off"
			: `${thinkingLabel(profile.thinkingLevel)} reasoning`;
	return [
		providerLabel(ctx, profile.provider),
		model ? modelLabel(model) : `${profile.model} (unavailable)`,
		reasoning,
	].join(" / ");
}

function setProfile(
	config: GoalaConfig,
	role: ModelRole,
	profile: ModelProfile,
): void {
	if (role === "fallbackExecutor") {
		config.fallbackExecutor = {
			...profile,
			afterRepairCycle: config.fallbackExecutor.afterRepairCycle,
		};
		return;
	}
	config[role] = profile;
}

async function selectThinkingLevel(
	ctx: ExtensionCommandContext,
	roleLabel: string,
	profile: FixedModelProfile,
	model: AvailableModel,
): Promise<ThinkingLevel | undefined> {
	const supported = supportedThinkingLevels(model);
	const current = clampThinkingLevel(model, profile.thinkingLevel);
	const ordered = [
		current,
		...supported.filter((level) => level !== current),
	];
	const choices = ordered.map((level, index) =>
		index === 0 ? `${thinkingLabel(level)} (current)` : thinkingLabel(level),
	);
	const selected = await ctx.ui.select(
		`${roleLabel} reasoning effort\nCurrent: ${thinkingLabel(current)}`,
		choices,
	);
	if (!selected) return undefined;
	return ordered[choices.indexOf(selected)];
}

async function selectProvider(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	roleLabel: string,
	currentProvider: string,
): Promise<string | undefined> {
	const providers = [...new Set(available.map((model) => model.provider))].sort(
		(left, right) => {
			if (left === currentProvider) return -1;
			if (right === currentProvider) return 1;
			return providerLabel(ctx, left).localeCompare(providerLabel(ctx, right));
		},
	);
	if (providers.length === 1) return providers[0];

	const choices = providers.map((provider, index) =>
		index === 0 && provider === currentProvider
			? `${providerLabel(ctx, provider)} (current)`
			: providerLabel(ctx, provider),
	);
	const selected = await ctx.ui.select(
		`${roleLabel} provider\nCurrent: ${providerLabel(ctx, currentProvider)}`,
		choices,
	);
	if (!selected) return undefined;
	return providers[choices.indexOf(selected)];
}

async function selectModel(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	roleLabel: string,
	provider: string,
	current: FixedModelProfile,
): Promise<AvailableModel | undefined> {
	const models = available
		.filter((model) => model.provider === provider)
		.sort((left, right) => {
			const leftCurrent =
				left.provider === current.provider && left.id === current.model;
			const rightCurrent =
				right.provider === current.provider && right.id === current.model;
			if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
			return modelLabel(left).localeCompare(modelLabel(right));
		});
	const choices = models.map((model, index) =>
		index === 0 &&
		model.provider === current.provider &&
		model.id === current.model
			? `${modelLabel(model)} (current)`
			: modelLabel(model),
	);
	const selected = await ctx.ui.select(
		`${roleLabel} model\nProvider: ${providerLabel(ctx, provider)}`,
		choices,
	);
	if (!selected) return undefined;
	return models[choices.indexOf(selected)];
}

async function changeModel(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	roleLabel: string,
	current: FixedModelProfile,
): Promise<ModelProfile | undefined> {
	const provider = await selectProvider(
		ctx,
		available,
		roleLabel,
		current.provider,
	);
	if (!provider) return undefined;
	const model = await selectModel(ctx, available, roleLabel, provider, current);
	if (!model) return undefined;

	const profile: FixedModelProfile = {
		kind: "fixed",
		provider: model.provider,
		model: model.id,
		thinkingLevel: clampThinkingLevel(model, current.thinkingLevel),
	};
	if (!model.reasoning) return profile;

	const thinkingLevel = await selectThinkingLevel(ctx, roleLabel, profile, model);
	if (!thinkingLevel) return undefined;
	return { ...profile, thinkingLevel };
}

function editableProfile(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	current: ModelProfile,
): FixedModelProfile | undefined {
	if (current.kind === "fixed") return current;
	const active = ctx.model
		? available.find(
			(model) =>
				model.provider === ctx.model?.provider && model.id === ctx.model?.id,
		)
		: undefined;
	const model = active ?? available[0];
	if (!model) return undefined;
	const requested = (ctx.thinkingLevel as ThinkingLevel | undefined) ?? "off";
	return {
		kind: "fixed",
		provider: model.provider,
		model: model.id,
		thinkingLevel: clampThinkingLevel(model, requested),
	};
}

async function configureRole(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	config: GoalaConfig,
	role: { key: ModelRole; label: string },
): Promise<boolean> {
	const current = config[role.key];
	const fixedCurrent = editableProfile(ctx, available, current);
	const currentModel = current.kind === "fixed"
		? available.find(
			(model) =>
				model.provider === current.provider && model.id === current.model,
		)
		: undefined;
	const actions = [
		KEEP_CURRENT,
		...(currentModel?.reasoning ? [CHANGE_REASONING] : []),
		CHANGE_MODEL,
	];
	const activation =
		role.key === "fallbackExecutor"
			? `\nActivates after ${config.fallbackExecutor.afterRepairCycle} failed verification attempts`
			: "";
	const action = await ctx.ui.select(
		`${role.label}${activation}\nCurrent: ${profileLabel(ctx, available, current)}`,
		actions,
	);
	if (!action) return false;
	if (action === KEEP_CURRENT) return true;

	if (action === CHANGE_REASONING) {
		if (current.kind !== "fixed" || !currentModel) return false;
		const thinkingLevel = await selectThinkingLevel(
			ctx,
			role.label,
			current,
			currentModel,
		);
		if (!thinkingLevel) return false;
		setProfile(config, role.key, { ...current, thinkingLevel });
		return true;
	}

	if (!fixedCurrent) return false;
	const profile = await changeModel(ctx, available, role.label, fixedCurrent);
	if (!profile) return false;
	setProfile(config, role.key, profile);
	return true;
}

function reviewSummary(
	ctx: ExtensionCommandContext,
	available: AvailableModel[],
	config: GoalaConfig,
): string {
	return MODEL_ROLES.map(
		(role) => {
			const label =
				role.key === "fallbackExecutor"
					? `${role.label} (after ${config.fallbackExecutor.afterRepairCycle} failed verification attempts)`
					: role.label;
			return `${label}: ${profileLabel(ctx, available, config[role.key])}`;
		},
	).join("\n");
}

export async function selectModelRoles(
	ctx: ExtensionCommandContext,
	current: GoalaConfig,
): Promise<GoalaConfig | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Per-role model setup requires interactive Pi.", "warning");
		return undefined;
	}

	try {
		await ctx.modelRegistry.refresh();
	} catch {
		// The current registry can still contain usable cached and built-in models.
	}
	const available = ctx.modelRegistry.getAvailable();
	if (available.length === 0) {
		ctx.ui.notify(
			"No authenticated models are available. Run /login, then retry /goala-setup.",
			"warning",
		);
		return undefined;
	}

	const proposed = structuredClone(current);
	for (const role of MODEL_ROLES) {
		if (!(await configureRole(ctx, available, proposed, role))) return undefined;
	}

	while (true) {
		const action = await ctx.ui.select(
			`Review Goala configuration\n${reviewSummary(ctx, available, proposed)}`,
			[SAVE_CONFIGURATION, EDIT_ROLE, CANCEL],
		);
		if (!action || action === CANCEL) return undefined;
		if (action === SAVE_CONFIGURATION) return proposed;

		const selectedRole = await ctx.ui.select(
			"Choose a role to edit",
			MODEL_ROLES.map((role) => role.label),
		);
		if (!selectedRole) return undefined;
		const role = MODEL_ROLES.find((candidate) => candidate.label === selectedRole);
		if (!role || !(await configureRole(ctx, available, proposed, role))) {
			return undefined;
		}
	}
}
