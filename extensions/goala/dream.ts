import type {
	DreamMemoryReader,
	MemoryDocumentReference,
	MemoryHit,
} from "pi-dream/interop";

const DREAM_INTEROP_SPECIFIER = "pi-dream/interop";
export const MAX_GOAL_MEMORY_CHARS = 64_000;
export const MAX_GOAL_MEMORY_REFERENCES = 8;

export type GoalMemoryAuthority = "advisory" | "binding";
export type GoalMemoryStatus = "available" | "unavailable" | "error";

export interface GoalMemoryReference extends MemoryDocumentReference {
	authority: GoalMemoryAuthority;
	excerpt: string;
	content: string;
}

export interface GoalMemoryContext {
	status: GoalMemoryStatus;
	repositoryIdentity?: string;
	references: GoalMemoryReference[];
	message?: string;
}

export interface GoalMemoryDiscovery {
	status: GoalMemoryStatus;
	repositoryIdentity?: string;
	hits: MemoryHit[];
	message?: string;
}

interface DreamInteropModule {
	createMemoryReader(): Promise<DreamMemoryReader>;
}

export type DreamInteropLoader = () => Promise<DreamInteropModule | undefined>;

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) return;
	return typeof error.code === "string" ? error.code : undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isMissingDreamInterop(error: unknown): boolean {
	if (errorCode(error) !== "ERR_MODULE_NOT_FOUND") return false;
	const message = errorMessage(error);
	return (
		message.includes("Cannot find package 'pi-dream'") ||
		message.includes('Cannot find package "pi-dream"') ||
		message.includes(`Cannot find module '${DREAM_INTEROP_SPECIFIER}'`) ||
		message.includes(`Cannot find module "${DREAM_INTEROP_SPECIFIER}"`)
	);
}

export async function loadDreamInterop(): Promise<DreamInteropModule | undefined> {
	try {
		return await import(DREAM_INTEROP_SPECIFIER);
	} catch (error) {
		if (isMissingDreamInterop(error)) return;
		throw error;
	}
}

function unavailableMessage(code: string | undefined): string | undefined {
	switch (code) {
		case "DREAM_NOT_INITIALIZED":
			return "Dream is installed but has not been initialized.";
		case "REPOSITORY_NOT_FOUND":
			return "The current directory is not inside a Git repository known to Dream.";
		case "REPOSITORY_NOT_MANAGED":
			return "Dream is installed, but the current repository is not managed by it.";
		default:
			return;
	}
}

export class DreamMemoryClient {
	private reader: DreamMemoryReader | undefined;

	constructor(private readonly loader: DreamInteropLoader = loadDreamInterop) {}

	private async getReader(): Promise<DreamMemoryReader | undefined> {
		if (this.reader) return this.reader;
		const interop = await this.loader();
		if (!interop) return;
		this.reader = await interop.createMemoryReader();
		return this.reader;
	}

	async discover(cwd: string, query: string): Promise<GoalMemoryDiscovery> {
		try {
			const reader = await this.getReader();
			if (!reader) {
				return {
					status: "unavailable",
					hits: [],
					message: "Dream is not installed. Goala will continue without durable memory.",
				};
			}
			const context = await reader.discover(cwd);
			const hits = (await reader.search(context, query)).slice(0, MAX_GOAL_MEMORY_REFERENCES);
			return {
				status: "available",
				repositoryIdentity: context.repositoryIdentity,
				hits,
			};
		} catch (error) {
			const message = unavailableMessage(errorCode(error));
			if (message) return { status: "unavailable", hits: [], message };
			return {
				status: "error",
				hits: [],
				message: `Dream memory could not be read: ${errorMessage(error)}`,
			};
		}
	}

	async capture(
		selected: Array<{ hit: MemoryHit; authority: GoalMemoryAuthority }>,
	): Promise<{ references: GoalMemoryReference[]; warnings: string[] }> {
		const reader = await this.getReader();
		if (!reader) return { references: [], warnings: ["Dream is not installed."] };

		const references: GoalMemoryReference[] = [];
		const warnings: string[] = [];
		let capturedChars = 0;
		for (const { hit, authority } of selected.slice(0, MAX_GOAL_MEMORY_REFERENCES)) {
			try {
				const document = await reader.read(hit);
				if (capturedChars + document.content.length > MAX_GOAL_MEMORY_CHARS) {
					warnings.push(
						`${hit.storeName}/${hit.path} was skipped because Goal memory context is limited to ${MAX_GOAL_MEMORY_CHARS.toLocaleString()} characters.`,
					);
					continue;
				}
				capturedChars += document.content.length;
				references.push({
					storeId: document.storeId,
					storeName: document.storeName,
					storeScope: document.storeScope,
					commit: document.commit,
					path: document.path,
					sha256: document.sha256,
					authority,
					excerpt: hit.excerpt,
					content: document.content,
				});
			} catch (error) {
				warnings.push(`${hit.storeName}/${hit.path} could not be captured: ${errorMessage(error)}`);
			}
		}
		return { references, warnings };
	}
}

export function emptyGoalMemoryContext(
	status: GoalMemoryStatus = "unavailable",
	message?: string,
): GoalMemoryContext {
	return { status, references: [], message };
}

export function formatGoalMemoryStatus(context: GoalMemoryContext): string {
	const title = "Dream guidance for this Goal";
	if (context.status === "error") {
		return [
			title,
			"",
			"Dream guidance could not be loaded.",
			context.message ?? "An unexpected Dream error occurred.",
			"",
			"Goala can still plan, execute, repair, and verify without it.",
		].join("\n");
	}
	if (context.status === "unavailable") {
		return [
			title,
			"",
			context.message ?? "Dream is not available for this repository.",
			"",
			"Goala works normally without Dream guidance.",
		].join("\n");
	}
	if (context.references.length === 0) {
		return [
			title,
			"",
			context.message ?? "No Dream documents were selected when this Goal started.",
			"",
			"This Goal is using only its objective, sources, repository, and current instructions.",
		].join("\n");
	}

	const advisory = context.references.filter((reference) => reference.authority === "advisory");
	const binding = context.references.filter((reference) => reference.authority === "binding");
	const section = (heading: string, explanation: string, references: GoalMemoryReference[]) =>
		references.length === 0
			? ""
			: [
				heading,
				explanation,
				...references.map(
					(reference) =>
						`• ${reference.storeName} — ${reference.path}\n  Version ${reference.commit.slice(0, 12)} · sha256 ${reference.sha256.slice(0, 12)}`,
				),
			].join("\n");
	const sections = [
		section(
			"Advisory guidance",
			"Useful background to confirm against the current repository.",
			advisory,
		),
		section(
			"Binding guidance",
			"Part of this Goal's acceptance contract and checked during verification.",
			binding,
		),
	].filter(Boolean).join("\n\n");
	return [
		title,
		"",
		`${context.references.length} document(s) were fixed when this Goal started.`,
		context.repositoryIdentity ? `Repository: ${context.repositoryIdentity}` : "",
		"",
		sections,
		"",
		"These documents stay fixed for this Goal. Start a new Goal to use newer Dream guidance.",
	].filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== "")).join("\n");
}
