import type { Phase } from "./workflow.ts";

const READ_ONLY_COMMANDS = [
	/^\s*cat\b/i,
	/^\s*head\b/i,
	/^\s*tail\b/i,
	/^\s*less\b/i,
	/^\s*more\b/i,
	/^\s*grep\b/i,
	/^\s*ls\b/i,
	/^\s*pwd\b/i,
	/^\s*wc\b/i,
	/^\s*sort\b/i,
	/^\s*uniq\b/i,
	/^\s*diff\b/i,
	/^\s*file\b/i,
	/^\s*stat\b/i,
	/^\s*du\b/i,
	/^\s*df\b/i,
	/^\s*tree\b/i,
	/^\s*which\b/i,
	/^\s*type\b/i,
	/^\s*uname\b/i,
	/^\s*whoami\b/i,
	/^\s*id\b/i,
	/^\s*date\b/i,
	/^\s*ps\b/i,
	/^\s*git\s+(status|log|diff|show|branch|remote|rev-parse|blame|grep|config\s+--get)\b/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
	/^\s*node\s+--version\b/i,
	/^\s*python(3)?\s+--version\b/i,
	/^\s*jq\b/i,
	/^\s*sed\s+-n\b/i,
	/^\s*rg\b/i,
	/^\s*fd\b/i,
	/^\s*bat\b/i,
	/^\s*eza\b/i,
];

const SHELL_COMPOSITION = /[;&|`\r\n]|\$\(|<\(|>\(/;

const MUTATING_COMMANDS = [
	/\brm(dir)?\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<>=])>(?![>=])/,
	/>>/,
	/\bsed\s+-i\b/i,
	/\bperl\s+-pi\b/i,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)\b/i,
	/\b(yarn|pnpm)\s+(add|remove|install|publish)\b/i,
	/\bpip(3)?\s+(install|uninstall)\b/i,
	/\bbrew\s+(install|uninstall|upgrade)\b/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|stash|cherry-pick|revert|tag|init|clone|clean)\b/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill(all)?\b/i,
	/\bpkill\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
	/\bservice\s+\S+\s+(start|stop|restart)\b/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
	/\bcurl\b.*(?:-X\s*(?:POST|PUT|PATCH|DELETE)|--data(?:-binary)?\b|--upload-file\b|\s-T\s)/i,
];

const HIGH_RISK_COMMANDS = [
	/\brm\s+(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)\b/i,
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\s+-[A-Za-z]*f/i,
	/\bgit\s+push\b/i,
	/\b(npm|pnpm|yarn)\s+publish\b/i,
	/\b(?:vercel|netlify|firebase|eas)\s+(?:deploy|publish)\b/i,
	/\bterraform\s+(?:apply|destroy)\b/i,
	/\bkubectl\s+(?:apply|delete|replace|patch)\b/i,
	/\bdocker\s+(?:push|system\s+prune)\b/i,
	/\bsudo\b/i,
	/\bshutdown\b/i,
	/\breboot\b/i,
];

export interface ToolPolicyEvent {
	toolName: string;
	input: Record<string, unknown>;
}

export interface ToolPolicyContext {
	hasUI: boolean;
	ui: {
		confirm(title: string, message: string): Promise<boolean>;
	};
}

export interface ToolPolicyResult {
	block: true;
	reason: string;
}

export function isReadOnlyCommand(command: string): boolean {
	if (SHELL_COMPOSITION.test(command)) return false;
	if (MUTATING_COMMANDS.some((pattern) => pattern.test(command))) return false;
	return READ_ONLY_COMMANDS.some((pattern) => pattern.test(command));
}

export async function enforceToolPolicy(
	phase: Phase,
	event: ToolPolicyEvent,
	ctx: ToolPolicyContext,
): Promise<ToolPolicyResult | undefined> {
	if (
		phase === "idle" ||
		phase === "paused" ||
		phase === "needs-attention" ||
		phase === "complete"
	) return;

	if (
		(phase === "planning" ||
			phase === "verifying" ||
			phase === "verifying-step" ||
			phase === "awaiting-review") &&
		(event.toolName === "edit" || event.toolName === "write")
	) {
		return { block: true, reason: `${phase} mode does not permit file edits.` };
	}

	if (event.toolName !== "bash") return;
	const command = typeof event.input.command === "string" ? event.input.command : "";
	if (
		(phase === "planning" ||
			phase === "awaiting-execution" ||
			phase === "awaiting-review") &&
		!isReadOnlyCommand(command)
	) {
		return {
			block: true,
			reason: `${phase} allows only read-only commands. Blocked: ${command}`,
		};
	}
	if (
		(phase === "verifying" ||
			phase === "verifying-step" ||
			phase === "awaiting-review") &&
		MUTATING_COMMANDS.some((pattern) => pattern.test(command))
	) {
		return {
			block: true,
			reason: `${phase} must remain non-editing. Blocked: ${command}`,
		};
	}
	if (!HIGH_RISK_COMMANDS.some((pattern) => pattern.test(command))) return;
	if (!ctx.hasUI) {
		return { block: true, reason: `High-risk command requires interactive confirmation: ${command}` };
	}
	const approved = await ctx.ui.confirm("High-risk command", `Allow this command?\n\n${command}`);
	if (!approved) return { block: true, reason: "High-risk command declined by the user." };
}
