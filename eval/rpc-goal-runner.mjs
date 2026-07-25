import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
	const result = {};
	for (let index = 2; index < argv.length; index += 2) {
		result[argv[index].replace(/^--/, "")] = argv[index + 1];
	}
	for (const required of ["cwd", "objective", "output"]) {
		if (!result[required]) throw new Error(`Missing --${required}`);
	}
	return result;
}

function sleep(ms) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

class PiRpc {
	constructor(cwd, sessionDir, env) {
		this.child = spawn(
			"pi",
			[
				"--mode",
				"rpc",
				"--model",
				"openai-codex/gpt-5.6-sol:medium",
				"--session-dir",
				sessionDir,
			],
			{ cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] },
		);
		this.buffer = "";
		this.stderr = "";
		this.pending = new Map();
		this.events = [];
		this.counter = 0;
		this.child.stdout.on("data", (chunk) => this.onData(chunk.toString()));
		this.child.stderr.on("data", (chunk) => {
			this.stderr += chunk.toString();
		});
		this.exitPromise = new Promise((resolvePromise) => {
			this.child.on("exit", (code, signal) => resolvePromise({ code, signal }));
		});
	}

	onData(chunk) {
		this.buffer += chunk;
		for (;;) {
			const newline = this.buffer.indexOf("\n");
			if (newline < 0) break;
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (!line.trim()) continue;
			let value;
			try {
				value = JSON.parse(line);
			} catch {
				this.events.push({ type: "invalid_json", line });
				continue;
			}
			if (value.type === "response" && value.id && this.pending.has(value.id)) {
				const pending = this.pending.get(value.id);
				this.pending.delete(value.id);
				value.success ? pending.resolve(value) : pending.reject(new Error(value.error || "RPC command failed"));
			} else {
				this.events.push(value);
			}
		}
	}

	send(type, payload = {}, timeoutMs = 30_000) {
		const id = `eval-${++this.counter}`;
		return new Promise((resolvePromise, rejectPromise) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				rejectPromise(new Error(`RPC timeout: ${type}`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolvePromise(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					rejectPromise(error);
				},
			});
			this.child.stdin.write(`${JSON.stringify({ id, type, ...payload })}\n`);
		});
	}

	async goalState() {
		const response = await this.send("get_entries");
		const entries = response.data?.entries ?? response.data ?? [];
		const states = entries.filter(
			(entry) => entry.type === "custom" && entry.customType === "goal-harness-state",
		);
		return states.at(-1)?.data;
	}

	async waitForPhase(phases, timeoutMs) {
		const started = Date.now();
		let last;
		while (Date.now() - started < timeoutMs) {
			try {
				last = await this.goalState();
				if (last && phases.includes(last.phase)) return last;
			} catch {
				// Session replacement can briefly race a read; retry against the rebound session.
			}
			await sleep(1000);
		}
		throw new Error(`Timed out waiting for ${phases.join("/")} (last: ${last?.phase ?? "none"})`);
	}

	async stop() {
		this.child.kill("SIGTERM");
		await Promise.race([this.exitPromise, sleep(5000)]);
		if (this.child.exitCode === null) this.child.kill("SIGKILL");
	}
}

function aggregateUsage(sessionFiles) {
	const total = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		totalTokens: 0,
		cost: 0,
		apiCalls: 0,
	};
	for (const path of sessionFiles ?? []) {
		if (!existsSync(path)) continue;
		for (const line of readFileSync(path, "utf8").split("\n")) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line);
				const usage = entry.type === "message" && entry.message?.role === "assistant"
					? entry.message.usage
					: undefined;
				if (!usage) continue;
				total.input += usage.input ?? 0;
				total.output += usage.output ?? 0;
				total.cacheRead += usage.cacheRead ?? 0;
				total.cacheWrite += usage.cacheWrite ?? 0;
				total.reasoning += usage.reasoning ?? 0;
				total.totalTokens += usage.totalTokens ?? 0;
				total.cost += usage.cost?.total ?? 0;
				total.apiCalls += 1;
			} catch {
				// Ignore partial or non-JSON lines in evaluation accounting.
			}
		}
	}
	total.cost = Number(total.cost.toFixed(6));
	return total;
}

const args = parseArgs(process.argv);
const cwd = resolve(args.cwd);
const output = resolve(args.output);
const sessionDir = resolve(args["session-dir"] ?? `${output}.sessions`);
mkdirSync(sessionDir, { recursive: true });

const rpc = new PiRpc(cwd, sessionDir, {
	PI_HARNESS_MEMORY_ENABLED: args.memory === "off" ? "0" : "1",
	PI_HARNESS_FRESH_SESSIONS: args["fresh-sessions"] === "off" ? "0" : "1",
	PI_HARNESS_MEMORY_ROOT: resolve(args["memory-root"] ?? `${output}.memory`),
});

const startedAt = new Date().toISOString();
let result;
try {
	await rpc.send("prompt", { message: `/goal ${args.objective}` }, 12 * 60_000);
	const planned = await rpc.waitForPhase(["awaiting-execution", "needs-attention"], 12 * 60_000);
	if (planned.phase !== "awaiting-execution") {
		throw new Error(`Planning stopped in ${planned.phase}: ${planned.blockedReason ?? "unknown"}`);
	}
	await rpc.send("prompt", { message: "/execute" }, 20 * 60_000);
	const finalState = await rpc.waitForPhase(["complete", "needs-attention"], 20 * 60_000);
	result = {
		status: finalState.phase === "complete" ? "pass" : "fail",
		startedAt,
		finishedAt: new Date().toISOString(),
		cwd,
		objective: args.objective,
		memory: args.memory === "off" ? "off" : "on",
		freshSessions: args["fresh-sessions"] === "off" ? "off" : "on",
		goal: finalState,
		usage: aggregateUsage(finalState.sessionFiles),
		rpcErrors: rpc.events.filter((event) => event.type === "error"),
		stderr: rpc.stderr,
	};
} catch (error) {
	result = {
		status: "error",
		startedAt,
		finishedAt: new Date().toISOString(),
		cwd,
		objective: args.objective,
		error: error instanceof Error ? error.stack : String(error),
		stderr: rpc.stderr,
		eventsTail: rpc.events.slice(-30),
	};
} finally {
	await rpc.stop();
}

mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "pass") process.exitCode = 1;
