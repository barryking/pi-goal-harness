# Pi Goal Harness

An installable plan → execute → independently verify workflow for
[Pi](https://pi.dev), with phase-isolated context and verifier-gated episodic
memory.

```text
goal → recall verified memory → read-only plan → explicit approval
                                                     |
                                                     v
                         fresh execution session → independent verify → complete
                                     ^                       |
                                     └──────── repair ───────┘

per-step review:
execute one step → run checks → human approve/revise → next step
                              └→ optional independent /verify
```

Pi Goal Harness turns an outcome into a persistent, testable workflow:

- a capable model inspects the repository and proposes acceptance criteria;
- implementation waits for explicit `/execute` approval;
- a faster coding model works through the approved plan;
- a separate verifier checks actual files and test output without editing;
- failed verification returns actionable defects to a bounded repair loop;
- only independently verified outcomes become searchable long-term memory.

## Install

Pi 0.82 or newer and Node.js 22.19 or newer are recommended.

From GitHub:

```text
pi install git:github.com/barryking/pi-goal-harness@v0.1.2
```

From a local checkout:

```text
pi install /absolute/path/to/pi-goal-harness
```

After a future npm release:

```text
pi install npm:pi-goal-harness
```

Pi packages execute with the permissions of the user running Pi. Review the
source before installing any extension.

Existing Pi installations do not normally need to be reset. If you are
replacing a hand-maintained harness and want a clean migration, preserve the
whole Pi agent directory before carrying only authentication into the new
installation. Old sessions remain in the backup for rollback and are not
imported into the clean installation. See
[clean migration and rollback](docs/configuration.md#clean-migration-and-rollback).

## Quick start

Open Pi in the project you want to change:

```text
pi
/harness-setup
/goal Describe the finished outcome and important constraints
```

Review the structured plan, then approve it:

```text
/execute
```

`/execute` uses the configured review policy. The default, `final`, executes
the approved plan and reviews it when complete. For a long-running or
direction-sensitive goal, request a human-in-the-loop approval gate after each
plan step:

```text
/execute per-step
```

Each step runs its declared checks and pauses with concrete evidence for
discussion. Run `/goal approve` to accept it and continue, `/goal revise
<feedback>` to return it to the executor, or `/verify` when the checkpoint
warrants an independent second opinion. The full goal always receives
independent final verification before completion.

Useful commands:

```text
/goal <objective>       Start a persistent goal
/goal status            Show phase, progress, and verification
/goal approve           Accept the reviewed step and continue
/goal revise <feedback> Return the reviewed step for revision
/goal pause             Stop advancing while preserving the goal
/goal resume            Continue a paused goal
/goal clear             Remove the active goal state
/goal-plan              Show the full approval plan and verification methods
/plan                   Re-plan before work has started
/plan --replace         Explicitly discard a progressed plan
/execute [final|per-step] Approve the plan with a review policy
/verify                 Independently verify a checkpoint or the final goal
/memory-status          List recent verified memories
/harness-setup          Choose a model preset
/harness-setup status   Show effective configuration
```

## Choosing a workflow

The harness is most useful when the desired outcome can be stated before
implementation begins. Choose the lightest flow that gives the work enough
control:

| Kind of work | Recommended flow |
|---|---|
| Typo or obvious one-line edit | Use Pi normally; a persistent goal adds little value |
| Small bug, test fix, or bounded refactor | One goal with `final` review |
| Feature with clear acceptance criteria | `final` when direction is settled; `per-step` when you want to inspect intermediate decisions |
| Greenfield, product, or visual work | `per-step`, with human review of each meaningful product milestone |
| Security, data migration, or other high-risk work | `per-step`; use `/verify` at the risky checkpoints and inspect the real diff or environment |
| Unclear or exploratory request | Plan and discuss first; do not run `/execute` until the outcome and acceptance criteria are credible |
| Multi-release or open-ended objective | Keep the parent roadmap in the repository and run one bounded harness goal per milestone |

### Small bug or bounded refactor

Describe the observable result, constraints, and checks—not a guessed
implementation:

```text
/goal Fix duplicate invoice creation when a retried request uses the same idempotency key. Preserve the public API and add a regression test.
/goal-plan
/execute final
```

This is the economical default. The executor works through the approved plan
in fresh context, then the independent verifier evaluates the whole result.

### Feature with reviewable milestones

Use checkpoints when an early implementation choice could change what should
happen later:

```text
/goal Add project-level task filtering with shareable URLs, keyboard access, and tests. Do not change the stored task format.
/goal-plan
/execute per-step
```

At each checkpoint, inspect the evidence and discuss the result with Pi. Then
choose one action:

```text
/goal approve
/goal revise Keep the URL parameter names compatible with the existing links
/verify
```

`/goal approve` starts the next step in a fresh execution session. `/goal
revise` reworks only the current step using your feedback. `/verify` adds an
independent checkpoint review and returns to the approval gate if it passes;
it is intentionally optional because running a second model after every step
substantially increases token use. Final independent verification is always
required.

### Greenfield or visual work

Ask the planner for a few meaningful, independently reviewable milestones,
such as product structure, a working interaction slice, and the final
accessibility/resilience pass. Avoid a long list of mechanical setup tasks.
Use `per-step` so you can run the app and judge the direction before approving
the next milestone.

The harness can verify files, tests, and declared checks, but subjective claims
such as “best looking” still need human review in the real UI. Treat `/verify`
as a technical second opinion, not a substitute for browser, device, or
usability review.

### Risky changes

For authentication, permissions, destructive migrations, deployment logic, or
security-sensitive code:

1. Put rollback, compatibility, and negative-test requirements in the goal.
2. Use `per-step` around irreversible or high-impact boundaries.
3. Run `/verify` before approving a checkpoint whose failure would be costly.
4. Review the actual diff and test output; use a disposable environment where
   appropriate.

The approval flow reduces accidental progression, but it is not an
operating-system sandbox and it does not make a risky command safe.

### An overarching goal

Do not make one harness goal carry an indefinite product roadmap. The harness
tracks one active goal in the current Pi session tree, and durable memory is
written only after that goal passes final verification. Instead:

1. Keep the stable objective, constraints, decisions, and milestone list in a
   repository document such as `PROJECT_GOAL.md` or `ROADMAP.md`.
2. Start a bounded `/goal` for the next milestone or release.
3. Use `per-step` inside that milestone when you want discussion and approval
   between implementation slices.
4. Complete and verify it, update the roadmap, then start the next goal.

This gives each executor only the context needed for its task while the
repository remains the source of truth across sessions.

### Where stack, architecture, and guidance belong

Harness memory is verified history, not the place to configure a project.
Use this hierarchy:

| Information | Put it here |
|---|---|
| Requirement or constraint for the current change | The `/goal` objective |
| Stable stack, coding conventions, required commands, and safety rules | The repository's `AGENTS.md` |
| Detailed architecture, domain rules, and decisions | Versioned repository docs, linked from `AGENTS.md` |
| Product direction and future milestones | `PROJECT_GOAL.md` or `ROADMAP.md` |
| Personal defaults that apply to every repository | `~/.pi/agent/AGENTS.md` |
| Facts learned from successfully completed work | Verified harness memory, generated automatically |

Pi loads repository and global `AGENTS.md` files into every fresh harness
phase. Keep them concise because repeated instructions consume context in
planning, execution, and verification. Put detailed material in files such as
`docs/architecture.md` or Architecture Decision Records, and tell the agent
when to read them:

```markdown
# Project guidance

## Stack
- Node.js 22, TypeScript in strict mode, React 19, and PostgreSQL 17.
- Do not introduce another state-management or database library.

## Architecture
- Keep domain logic independent of HTTP and persistence adapters.
- Read `docs/architecture.md` before changing module boundaries.
- Record accepted architectural decisions under `docs/decisions/`.

## Validation
- Run `npm run check` for code changes.
- Run integration tests for database or API changes.

## Safety
- Never run production migrations from a development session.
```

Run `/reload` after changing `AGENTS.md`. For a one-off exception, state it in
the goal instead of changing the durable project rules:

```text
/goal Add CSV export using the existing TypeScript and React stack. Keep domain logic framework-independent, follow docs/architecture.md, and do not add runtime dependencies.
```

If a verified task discovers a reusable fact, the planner or executor can
stage it as a memory note. That note is promoted only after final verification.
Important decisions should still be committed to the repository; future
memory is bounded, relevance-ranked, and deliberately treated as untrusted
evidence.

### When direction changes

Use `/goal revise <feedback>` when the current checkpoint needs rework. Use
`/goal pause` and `/goal resume` when discussion or outside work interrupts the
flow. Before execution begins, `/plan` can safely regenerate the plan. After
progress exists, `/plan --replace` deliberately discards the structured plan
history and creates a new plan; it does not undo repository changes. Prefer a
new bounded goal when the desired outcome has materially changed.

## Model roles

The recommended OpenAI Codex preset is:

| Phase | Model | Reasoning |
|---|---|---:|
| Plan | `gpt-5.6-sol` | medium |
| Execute | `gpt-5.6-luna` | medium |
| Optional step verification | `gpt-5.6-luna` | medium |
| Verify | `gpt-5.6-sol` | medium |
| Repeated repair | `gpt-5.6-terra` | medium |

If those models are unavailable, the harness can use the model that was active
when Pi started. Run `/harness-setup current` to persist that portable
single-model configuration. Advanced users can configure each role in
`~/.pi/agent/pi-goal-harness/config.json`.

The package does not overwrite Pi's `settings.json`, model list, skills,
prompts, other extensions, or authentication.

## Memory with a trust boundary

Memory is local, bounded, and advisory:

1. Starting `/goal` searches verified episodes using the new objective and
   ranks results from the current repository first.
2. Up to four relevant results and 6,000 characters are recalled by default;
   planning and execution may run narrower searches when needed.
3. Recall contains outcomes, reusable notes, relevant files, and provenance.
   It does not replay the previous planning or execution conversation.
4. Current code, `AGENTS.md`, tests, the goal, and acceptance criteria outrank
   memory. Recall is labelled as untrusted evidence, never instructions.
5. Planning and execution can stage concise repository, code, workflow,
   friction, or open-item notes. Checkpoint approval does not persist them.
6. The final verifier receives no recalled memory or executor completion
   claims. Only its `PASS` promotes the completed episode and staged notes into
   durable memory for later goals.
7. Common secret patterns are redacted, content hashes deduplicate episodes,
   and full redacted transcripts remain cold evidence that is never
   auto-injected.

Memory therefore helps a later related goal rediscover what previously worked;
it does not guarantee a preferred stack, enforce architecture, remember every
discussion, or replace version-controlled project documentation. Run
`/memory-status` to see recent promoted episodes.

Data is namespaced under:

```text
~/.pi/agent/pi-goal-harness/
├── config.json
└── memory/
    ├── coala.sqlite3
    └── evidence/<goal-id>/
```

Directories are `0700`; configuration, database, manifests, and transcript
evidence are `0600`.

## Context isolation

The harness does not forward the complete planning conversation into
execution. Interactive planning and execution use separate Pi sessions with a
small persisted handoff. In `per-step` review, every approved step starts the
next executor session with only the remaining plan and relevant goal state.
Automatic execution-to-verification transitions use a signed context boundary
so each verifier sees the goal, relevant criteria and verification methods,
and current tool results—not recalled memory or old completion claims.

The complete transcript remains local for provenance while provider context is
bounded to what the current phase needs.

## Evaluation evidence

The repository includes deterministic memory/context tests and a reproducible
end-to-end fixture. Results from the original OpenAI Codex evaluation:

| Measurement | Control | Memory flow | Change |
|---|---:|---:|---:|
| Hidden contract | FAIL | PASS | Quality improved |
| Uncached input tokens | 61,577 | 55,380 | -10.1% |
| Output tokens | 5,488 | 5,693 | +3.7% |
| Cache-read tokens | 36,864 | 44,544 | +20.8% |
| Total tokens | 103,929 | 105,617 | +1.6% |
| Reported cost | $0.310883 | $0.295532 | -4.9% |

The isolated executor context shrank from 5,671 to 1,437 characters, a 74.7%
reduction. The packaged extension was then installed into a clean Pi home and
passed 6/6 public tests, its independent hidden contract, and Sol verification
with zero repairs. That packaged run used 98,184 total tokens across 21 calls
and reported a cost of $0.339985.

These are fixture results, not a promise of universal savings. In the paired
run, uncached input and cost fell while total processed tokens rose slightly
because cache reads increased. See [the evaluation methodology](docs/evaluation.md).

The later per-step benchmark also passed the hidden contract and final
verification. Pausing for human review after three milestones used 143,765
tokens and 31 calls—52.3% more tokens than the 94,425-token final-only
reference. Automatically invoking an independent verifier at every checkpoint
raised usage to 220,712 tokens. This is why checkpoint `/verify` is optional
while final independent verification remains mandatory.

## Safety

Planning and verification expose only inspection tools and allow-listed
read-only commands. High-risk execution commands require interactive
confirmation and are blocked in non-interactive runs.

This is application-level policy, not an operating-system sandbox. Pi
extensions run with the user's filesystem, process, network, and credential
access. See [security and limitations](docs/security.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Memory model](docs/memory.md)
- [Evaluation](docs/evaluation.md)
- [Security](docs/security.md)
- [Contributing](CONTRIBUTING.md)

## Influences and acknowledgments

The memory architecture is inspired by
[CoALA: Cognitive Architectures for Language Agents](https://arxiv.org/abs/2309.02427),
especially its separation of working and long-term memory. The original
experiment was also prompted by
[this memory-system talk](https://www.youtube.com/watch?v=BacJ6sEhqMo).

Public implementation notes from
[Entire's checkpoint architecture](https://github.com/entireio/cli/blob/ec5d9a7610039703017e4fa8c34a070ce47dc3b3/docs/architecture/sessions-and-checkpoints.md#L196-L255)
informed the general ideas of provenance and progressive disclosure. Pi Goal
Harness is an independent implementation and has no Entire runtime, service,
SDK, storage-format, or installation dependency.

## License

MIT
