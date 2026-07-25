# Changelog

## Unreleased

- Add `final` and `per-step` review policies.
- Pause after each step with validation evidence for a human approval or
  revision gate, with optional independent `/verify`.
- Add a separately configurable fast step-verifier role while retaining the
  stronger final verifier.
- Preserve review checkpoints across pause and resume.
- Require explicit confirmation or `--replace` before discarding active goal
  and progressed-plan state.
- Enforce read-only discussion before plan and step approval.
- Require non-empty verification summaries and concrete check evidence.
- Replace vendor-specific setup branching with a data-driven preset registry.
- Require Pi coding-agent and TUI hosts at version 0.82.1 or newer.
- Clarify authentication-only clean migration and `/goal-plan` pre-plan
  feedback.
- Discover unfinished goals from recent same-project Pi sessions when
  `/goal-status` is run from an idle session, including path aliases and
  case-insensitive filesystem spellings.
- Render goal status as a persistent TUI-only entry rather than a transient
  notification.

## 0.1.2

- Render full plans through Pi's registered TUI entry API.
- Keep displayed plans out of model context to avoid duplicate token usage.

## 0.1.1

- Display the complete structured plan persistently before execution approval.
- Add `/goal-plan` to reopen acceptance criteria, risks, implementation details,
  and per-step verification methods.

## 0.1.0

- Add persistent goal, plan, execution, verification, and bounded repair phases.
- Add configurable planner, executor, verifier, and repair model roles.
- Add fresh planning/execution sessions and logical verifier context isolation.
- Add verifier-gated local episodic memory with SQLite FTS5 retrieval.
- Add redacted cold evidence, content-hash deduplication, and repository provenance.
- Add namespaced, non-destructive configuration and storage.
- Add `/harness-setup`, `/memory-status`, and goal lifecycle commands.
- Add static, packaging, and end-to-end evaluation fixtures.
