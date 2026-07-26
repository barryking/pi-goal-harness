import { createHash } from "node:crypto";
import {
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import {
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";

export const MAX_GOAL_SOURCES = 8;
export const MAX_GOAL_SOURCE_BYTES = 1_000_000;

export interface GoalSource {
	path: string;
	sha256: string;
	bytes: number;
}

export interface GoalRequest {
	objective: string;
	sourcePaths: string[];
}

export interface GoalSourceDrift {
	path: string;
	status: "changed" | "missing";
	detail: string;
}

function tokenizeOptions(input: string): string[] {
	const tokens: string[] = [];
	let token = "";
	let quote: "'" | "\"" | undefined;
	let escaping = false;

	for (const character of input) {
		if (escaping) {
			token += character;
			escaping = false;
			continue;
		}
		if (character === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = undefined;
			else token += character;
			continue;
		}
		if (character === "'" || character === "\"") {
			quote = character;
			continue;
		}
		if (/\s/.test(character)) {
			if (token) {
				tokens.push(token);
				token = "";
			}
			continue;
		}
		token += character;
	}

	if (escaping) token += "\\";
	if (quote) throw new Error("Source path has an unclosed quote.");
	if (token) tokens.push(token);
	return tokens;
}

function goalSeparator(input: string): number | undefined {
	let quote: "'" | "\"" | undefined;
	let escaping = false;
	for (let index = 0; index < input.length - 1; index++) {
		const character = input[index];
		if (escaping) {
			escaping = false;
			continue;
		}
		if (character === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === "\"") {
			quote = character;
			continue;
		}
		if (
			character === "-" &&
			input[index + 1] === "-" &&
			index > 0 &&
			/\s/.test(input[index - 1]) &&
			/\s/.test(input[index + 2] ?? "")
		) return index;
	}
}

export function parseGoalRequest(input: string): GoalRequest {
	const trimmed = input.trim();
	if (!/^--source(?:=|\s)/.test(trimmed)) {
		return { objective: trimmed, sourcePaths: [] };
	}

	const separator = goalSeparator(trimmed);
	if (!separator) {
		throw new Error(
			"Source-backed goals require `--` before the objective: /goal --source docs/PRD.md -- <objective>",
		);
	}
	const objective = trimmed.slice(separator + 2).trim();
	if (!objective) throw new Error("A goal objective is required after `--`.");

	const tokens = tokenizeOptions(trimmed.slice(0, separator));
	const sourcePaths: string[] = [];
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token === "--source") {
			const path = tokens[++index];
			if (!path) throw new Error("Each --source option requires a file path.");
			sourcePaths.push(path);
			continue;
		}
		if (token.startsWith("--source=")) {
			const path = token.slice("--source=".length);
			if (!path) throw new Error("Each --source option requires a file path.");
			sourcePaths.push(path);
			continue;
		}
		throw new Error(`Unknown goal option: ${token}`);
	}

	if (sourcePaths.length === 0) throw new Error("At least one --source path is required.");
	if (sourcePaths.length > MAX_GOAL_SOURCES) {
		throw new Error(`A goal can reference at most ${MAX_GOAL_SOURCES} source documents.`);
	}
	return { objective, sourcePaths };
}

export function resolveGoalSources(cwd: string, sourcePaths: string[]): GoalSource[] {
	const root = realpathSync(cwd);
	const sources: GoalSource[] = [];
	const seen = new Set<string>();

	for (const requestedPath of sourcePaths) {
		if (requestedPath.length > 1000) throw new Error("A source path exceeds 1,000 characters.");
		let sourcePath: string;
		try {
			sourcePath = realpathSync(
				isAbsolute(requestedPath) ? requestedPath : resolve(root, requestedPath),
			);
		} catch {
			throw new Error(`Goal source does not exist: ${requestedPath}`);
		}

		const projectPath = relative(root, sourcePath);
		if (
			projectPath === "" ||
			projectPath === ".." ||
			projectPath.startsWith(`..${sep}`) ||
			isAbsolute(projectPath)
		) {
			throw new Error(`Goal sources must be files inside the current project: ${requestedPath}`);
		}
		if (seen.has(sourcePath)) continue;

		const stats = statSync(sourcePath);
		if (!stats.isFile()) throw new Error(`Goal source is not a regular file: ${requestedPath}`);
		if (stats.size > MAX_GOAL_SOURCE_BYTES) {
			throw new Error(
				`Goal source exceeds ${MAX_GOAL_SOURCE_BYTES.toLocaleString()} bytes: ${requestedPath}`,
			);
		}
		const content = readFileSync(sourcePath);
		try {
			new TextDecoder("utf-8", { fatal: true }).decode(content);
		} catch {
			throw new Error(`Goal source must be UTF-8 text: ${requestedPath}`);
		}

		seen.add(sourcePath);
		sources.push({
			path: projectPath.split(sep).join("/"),
			sha256: createHash("sha256").update(content).digest("hex"),
			bytes: content.byteLength,
		});
	}
	return sources;
}

export function inspectGoalSources(
	cwd: string,
	sources: GoalSource[],
): GoalSourceDrift[] {
	const root = realpathSync(cwd);
	return sources.flatMap((source): GoalSourceDrift[] => {
		try {
			const currentPath = realpathSync(resolve(root, source.path));
			const projectPath = relative(root, currentPath);
			if (
				projectPath === ".." ||
				projectPath.startsWith(`..${sep}`) ||
				isAbsolute(projectPath)
			) {
				return [{
					path: source.path,
					status: "missing" as const,
					detail: "the path no longer resolves inside the current project",
				}];
			}
			const stats = statSync(currentPath);
			if (!stats.isFile()) {
				return [{
					path: source.path,
					status: "missing" as const,
					detail: "the captured source is no longer a regular file",
				}];
			}
			if (stats.size > MAX_GOAL_SOURCE_BYTES) {
				return [{
					path: source.path,
					status: "changed" as const,
					detail: `the current file exceeds ${MAX_GOAL_SOURCE_BYTES.toLocaleString()} bytes`,
				}];
			}
			const content = readFileSync(currentPath);
			const sha256 = createHash("sha256").update(content).digest("hex");
			if (sha256 === source.sha256) return [];
			return [{
				path: source.path,
				status: "changed" as const,
				detail: `captured ${source.sha256.slice(0, 12)}, current ${sha256.slice(0, 12)}`,
			}];
		} catch {
			return [{
				path: source.path,
				status: "missing" as const,
				detail: "the captured source cannot be read",
			}];
		}
	});
}

export function formatSourceDrift(drift: GoalSourceDrift[]): string {
	if (drift.length === 0) return "";
	return `AUTHORITATIVE SOURCE DRIFT
${drift.map((source) => `- ${source.path}: ${source.status} — ${source.detail}`).join("\n")}
Stop and surface this discrepancy. Do not silently reinterpret the approved acceptance contract.`;
}
