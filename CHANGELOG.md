# Changelog

## 0.3.0 (2026-07-26)

- Add interactive per-phase provider, model, and reasoning selection from Pi's
  authenticated available-model registry.
- Support mixed-provider planner, executor, step-verifier, final-verifier, and
  repeated-repair roles.
- Migrate version 1 single-provider configuration to the version 2 per-role
  schema without retaining the obsolete top-level provider.

## 0.2.0 (2026-07-26)

- Rename the package, repository, extension namespace, storage, environment
  variables, and setup command to Goala (`pi-goala`).
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
- Align the four CoALA memory types with Pi-native working context,
  `AGENTS.md`/project documentation, skills/workflows, and distilled episodic
  recall instead of treating every type as SQLite content.
- Promote only evidence-backed findings produced by the independent final
  verifier; planner and executor claims no longer become durable learnings.
- Add recoverable `/memory retire` and `/memory restore` lifecycle controls,
  repository ancestry labels, and visible memory-health diagnostics.
- Make full redacted transcript retention opt-in and harden evidence directory
  naming and duplicate writes.
- Split the extension entry point into clearly owned `tools`, `session`,
  `policy`, and `presenters` modules, with direct boundary tests.
- Add authoritative goal-source documents with bounded project-local
  resolution, persistent hashes, phase-wide references, and drift detection.
- Document the original one-fixture benchmark as a retrieval experiment and
  define a multi-condition organic lifecycle evaluation.

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
- Add `/goala-setup`, `/memory-status`, and goal lifecycle commands.
- Add static, packaging, and end-to-end evaluation fixtures.
