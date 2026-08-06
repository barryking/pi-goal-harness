import type {
	DreamMemoryReader,
	MemoryDocument,
	MemoryDocumentReference,
	MemoryHit,
} from "pi-dream/interop";

const DREAM_INTEROP_SPECIFIER = "pi-dream/interop";
export const MAX_GOAL_MEMORY_CHARS = 64_000;
export const MAX_GOAL_MEMORY_REFERENCES = 8;
export const DREAM_OPERATION_TIMEOUT_MS = 10_000;

export type GoalMemoryAuthority = "advisory" | "binding";
export type GoalMemoryStatus = "available" | "unavailable" | "error";

export interface GoalMemoryReference extends MemoryDocumentReference {
	authority: GoalMemoryAuthority;
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

type CaptureAttempt =
	| {
		ok: true;
		hit: MemoryHit;
		authority: GoalMemoryAuthority;
		document: MemoryDocument;
	}
	| { ok: false; warning: string };

export type DreamInteropLoader = () => Promise<DreamInteropModule | undefined>;

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) return;
	return typeof error.code === "string" ? error.code : undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class DreamTimeoutError extends Error {
	readonly code = "DREAM_TIMEOUT";

	constructor(operation: string, timeoutMs: number) {
		super(`${operation} did not complete within ${timeoutMs / 1000} seconds.`);
	}
}

function withDreamTimeout<T>(
	operation: Promise<T>,
	label: string,
	timeoutMs: number,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new DreamTimeoutError(label, timeoutMs)),
			timeoutMs,
		);
		operation.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
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
		case "DREAM_TIMEOUT":
			return "Dream did not respond in time. Goala will continue without Dream guidance.";
		default:
			return;
	}
}

export class DreamMemoryClient {
	private reader: DreamMemoryReader | undefined;

	constructor(
		private readonly loader: DreamInteropLoader = loadDreamInterop,
		private readonly operationTimeoutMs = DREAM_OPERATION_TIMEOUT_MS,
	) {}

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
			const { context, hits } = await withDreamTimeout((async () => {
				const context = await reader.discover(cwd);
				const hits = await reader.search(context, query);
				return { context, hits };
			})(), "Dream discovery", this.operationTimeoutMs);
			return {
				status: "available",
				repositoryIdentity: context.repositoryIdentity,
				hits: hits.slice(0, MAX_GOAL_MEMORY_REFERENCES),
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

		const selections = selected.slice(0, MAX_GOAL_MEMORY_REFERENCES);
		const attempts: CaptureAttempt[] = await Promise.all(selections.map(async ({ hit, authority }) => {
			try {
				const document = await withDreamTimeout(
					reader.read(hit),
					`Dream read for ${hit.storeName}/${hit.path}`,
					this.operationTimeoutMs,
				);
				return { ok: true, hit, authority, document } as const;
			} catch (error) {
				return {
					ok: false,
					warning: `${hit.storeName}/${hit.path} could not be captured: ${errorMessage(error)}`,
				} as const;
			}
		}));

		const references: GoalMemoryReference[] = [];
		const warnings: string[] = [];
		let capturedChars = 0;
		for (const attempt of attempts) {
			if (!attempt.ok) {
				warnings.push(attempt.warning);
				continue;
			}
			const { hit, authority, document } = attempt;
			if (
				document.storeId !== hit.storeId ||
				document.storeName !== hit.storeName ||
				document.storeScope !== hit.storeScope ||
				document.commit !== hit.commit ||
				document.path !== hit.path ||
				document.sha256 !== hit.sha256
			) {
				warnings.push(
					`${hit.storeName}/${hit.path} was skipped because Dream returned a different document version or hash.`,
				);
				continue;
			}
			if (capturedChars + document.content.length > MAX_GOAL_MEMORY_CHARS) {
				warnings.push(
					`${hit.storeName}/${hit.path} was skipped because Goal memory context is limited to ${MAX_GOAL_MEMORY_CHARS.toLocaleString("en-US")} characters.`,
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
				content: document.content,
			});
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
