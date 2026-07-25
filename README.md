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
pi install git:github.com/barryking/pi-goal-harness@v0.1.1
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
installation. See [clean migration and rollback](docs/configuration.md#clean-migration-and-rollback).

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

Execution and verification continue automatically. A goal is complete only
after the verifier records passing evidence for every acceptance criterion.

Useful commands:

```text
/goal <objective>       Start a persistent goal
/goal status            Show phase, progress, and verification
/goal-plan              Show the full approval plan and verification methods
/plan                   Replace the current plan
/execute                Approve the stored plan
/verify                 Re-run independent verification
/memory-status          List recent verified memories
/harness-setup          Choose a model preset
/harness-setup status   Show effective configuration
```

## Model roles

The recommended OpenAI Codex preset is:

| Phase | Model | Reasoning |
|---|---|---:|
| Plan | `gpt-5.6-sol` | medium |
| Execute | `gpt-5.6-luna` | medium |
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

1. Current code, tests, the goal, and acceptance criteria outrank memory.
2. Recall is labelled as untrusted evidence, never instructions.
3. The verifier receives no recalled memory or executor completion claims.
4. Only a verifier `PASS` promotes an episode into durable memory.
5. Common secret patterns are redacted before persistence.
6. Content hashes deduplicate repeated episodes.
7. Full redacted transcripts remain cold evidence and are never auto-injected.

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
small persisted handoff. Automatic execution-to-verification transitions use
a signed context boundary so the verifier sees the goal, criteria,
verification methods, and current tool results—not recalled memory or old
completion claims.

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
