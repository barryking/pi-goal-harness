import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type {
	GoalaConfig,
	ModelProfile,
	ThinkingLevel,
} from "./config.ts";

type ModelRole =
	| "planner"
	| "executor"
	| "stepVerifier"
	| "verifier"
	| "fallbackExecutor";

const MODEL_ROLES: ReadonlyArray<{ key: ModelRole; label: string }> = [
	{ key: "planner", label: "Planner" },
	{ key: "executor", label: "Executor" },
	{ key: "stepVerifier", label: "Step verifier" },
	{ key: "verifier", label: "Final verifier" },
	{ key: "fallbackExecutor", label: "Repair fallback" },
];

const THINKING_LEVELS: readonly ThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

function profileLabel(profile: ModelProfile): string {
	return `${profile.provider}/${profile.model}:${profile.thinkingLevel}`;
}

export async function selectModelRoles(
	ctx: ExtensionCommandContext,
	current: GoalaConfig,
): Promise<GoalaConfig | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Per-phase model setup requires interactive Pi.", "warning");
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
		const existing = proposed[role.key];
		const ordered = [...available].sort((left, right) => {
			const leftCurrent =
				left.provider === existing.provider && left.id === existing.model;
			const rightCurrent =
				right.provider === existing.provider && right.id === existing.model;
			if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
			return `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`);
		});
		const choices = ordered.map((model) => {
			const provider = ctx.modelRegistry.getProviderDisplayName(model.provider);
			const name = model.name && model.name !== model.id ? `${model.name} · ` : "";
			return `${provider} · ${name}${model.provider}/${model.id}`;
		});
		const selected = await ctx.ui.select(
			`${role.label} model\nCurrent: ${profileLabel(existing)}`,
			choices,
		);
		if (!selected) return undefined;
		const model = ordered[choices.indexOf(selected)];
		if (!model) return undefined;

		let thinkingLevel: ThinkingLevel = "off";
		if (model.reasoning) {
			const selectedThinking = await ctx.ui.select(
				`${role.label} reasoning\n${model.provider}/${model.id}`,
				[...THINKING_LEVELS],
			);
			if (!selectedThinking) return undefined;
			thinkingLevel = selectedThinking as ThinkingLevel;
		}

		const profile: ModelProfile = {
			provider: model.provider,
			model: model.id,
			thinkingLevel,
		};
		if (role.key === "fallbackExecutor") {
			proposed.fallbackExecutor = {
				...profile,
				afterRepairCycle: current.fallbackExecutor.afterRepairCycle,
			};
		} else {
			proposed[role.key] = profile;
		}
	}
	return proposed;
}
