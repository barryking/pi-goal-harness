# Changelog

## 0.4.0 (2026-08-06)

- Replace Goala's SQLite-backed episodic memory with an optional read-only
  `pi-dream/interop` consumer.
- Capture user-selected advisory or binding Dream documents as an immutable,
  bounded Goal-start snapshot and add `/goal context` diagnostics.
- Remove the SQLite module, memory commands, memory model tools, completion
  writes, memory configuration/environment variables, and legacy migration
  paths.
- Make every model role follow Pi's session-default model by default, remove
  the vendor-specific OpenAI preset, and use each model's Pi metadata to limit
  reasoning settings to supported levels.
- Bump Goal state to version 5 and configuration to version 4; older recalled
  packets and memory configuration are dropped during normalization.
- Require Pi 0.83.0 and declare Dream 0.3.0 as an optional peer.

## 0.3.3 (2026-07-26)

- Rename the memory database from `coala.sqlite3` to `goala.sqlite3` so local
  storage consistently uses the product namespace.
- Do not migrate or read the obsolete database filename.

## 0.3.2 (2026-07-26)

- Document how `AGENTS.md` and Pi skills customise project and personal
  workflows around Goala's lifecycle.
- Describe planning, execution, and verification models as roles rather than
  incorrectly presenting the repair loop as a separate phase.
- Clarify the fallback executor activation threshold and distinguish it from
  unavailable-model fallback.
- Add direct and extension-level routing tests for every model role, including
  the fallback activation boundary.

## 0.3.1 (2026-07-26)

- Make each role default to keeping its current model configuration.
- Separate reasoning-effort changes from provider/model changes.
- Select provider, then a filtered model, while skipping provider selection
  when only one authenticated provider is available.
- Review, edit, save, or cancel the complete configuration atomically.

## 0.3.0 (2026-07-26)

- Add interactive per-role provider, model, and reasoning selection from Pi's
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

- Add persistent goal, plan, execution, verification, and bounded repair loops.
- Add configurable planner, executor, verifier, and repair model roles.
- Add fresh planning/execution sessions and logical verifier context isolation.
- Add verifier-gated local episodic memory with SQLite FTS5 retrieval.
- Add redacted cold evidence, content-hash deduplication, and repository provenance.
- Add namespaced, non-destructive configuration and storage.
- Add `/goala-setup`, `/memory-status`, and goal lifecycle commands.
- Add static, packaging, and end-to-end evaluation fixtures.
