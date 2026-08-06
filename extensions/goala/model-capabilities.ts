import { THINKING_LEVELS, type ThinkingLevel } from "./config.ts";

export interface ReasoningModel {
	reasoning: boolean;
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
}

export function supportedThinkingLevels(
	model: ReasoningModel,
): ThinkingLevel[] {
	if (!model.reasoning) return ["off"];
	return THINKING_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh" || level === "max") return mapped !== undefined;
		return true;
	});
}

export function clampThinkingLevel(
	model: ReasoningModel,
	requested: ThinkingLevel,
): ThinkingLevel {
	const supported = supportedThinkingLevels(model);
	if (supported.includes(requested)) return requested;

	const requestedIndex = THINKING_LEVELS.indexOf(requested);
	// Match Pi's own clampThinkingLevel ordering: prefer the next supported
	// higher level, then search downward when no higher level is available.
	for (let index = requestedIndex + 1; index < THINKING_LEVELS.length; index += 1) {
		const candidate = THINKING_LEVELS[index];
		if (supported.includes(candidate)) return candidate;
	}
	for (let index = requestedIndex - 1; index >= 0; index -= 1) {
		const candidate = THINKING_LEVELS[index];
		if (supported.includes(candidate)) return candidate;
	}
	return "off";
}
