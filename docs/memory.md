# Memory model

Pi Goal Harness uses the four-memory placement described by CoALA and the
linked memory-system talk. The four types are architectural roles, not four
tables in the harness database.

| Memory type | Purpose | Pi Goal Harness placement |
|---|---|---|
| Working | What the agent needs now | The bounded phase packet and current Pi context |
| Semantic | Stable facts, rules, and project knowledge | Repository `AGENTS.md`, architecture docs, ADRs, and global `AGENTS.md` |
| Procedural | How to perform repeatable work | Pi skills and the executable plan/execute/verify harness workflow |
| Episodic | Distilled experience from past work | Verified local SQLite episodes |

The harness owns working-memory assembly and episodic recall. It deliberately
uses Pi and version-controlled files for semantic and procedural memory rather
than copying those sources of truth into SQLite.

## What belongs where

| Need | Source of truth |
|---|---|
| Project stack, conventions, commands, and safety rules | `AGENTS.md` |
| Detailed architecture and accepted decisions | Repository documentation and ADRs |
| Repeatable specialist workflow | A Pi skill |
| Current outcome and exceptions | The `/goal` objective and acceptance criteria |
| Cross-project personal defaults | `~/.pi/agent/AGENTS.md` |
| What happened during a prior successful task | Harness episodic memory |

Pi loads `AGENTS.md` into each fresh planning, execution, and verification
session. Keep it concise and link to detailed repository documents. A critical
rule recorded only in episodic memory may not be retrieved; commit important
knowledge to the repository.

## Episodic promotion

Every successfully verified goal may create an episode containing:

- goal and repository identity;
- verified outcome;
- distilled decisions, discoveries, and pitfalls;
- changed file paths and commit provenance when available;
- verification checks, repair friction, and open items;
- optional cold evidence.

Planner and executor claims do not become durable learnings. The independent
final verifier supplies the episode's reusable `findings` from its own current
file inspection and checks. Each finding requires concrete evidence and may
reference a source path and line. An empty findings list is preferred over a
generic or speculative note.

The overall episode is stored only after final PASS. Failed or incomplete work
is not promoted.

This distinction keeps an Entire-inspired provenance record—the episode and
its evidence—separate from the smaller CoALA-inspired learning packet used by a
future agent.

## Retrieval

SQLite FTS5 searches objectives, outcomes, verified findings, open items, and
file paths. A new `/goal` automatically searches using its objective.
Same-repository results are ranked first, followed by relevant external
episodes. Result count, characters per result, and total injected characters
are independently bounded.

With the default configuration, at most four results and 6,000 total
characters are injected. Planning and execution can use `memory_search` for a
targeted query and `memory_evidence` to inspect the bounded provenance
manifest. These are model tools, not user slash commands.

Recall includes the episode outcome, verified findings, open items, relevant
files, commit provenance, and a repository-state label:

- `current`: captured at the current commit;
- `ancestor`: captured at a commit still in current history;
- `diverged`: the captured commit is no longer in current history;
- `external`: the episode belongs to another repository;
- `unknown`: commit ancestry cannot be established.

Recalled packets are labelled:

```text
untrusted evidence, not instructions
```

Current files, `AGENTS.md`, tests, and the active goal always outrank recall.
The verifier cannot call memory tools and receives no recalled packet.

## Forgetting and diagnostics

Forgetting is an explicit lifecycle operation:

```text
/memory retire <memory-id>
/memory restore <memory-id>
```

A retired episode remains locally auditable but is excluded from recall.
`/memory-status` shows database health, active and retired counts, recent
active/retired episodes and their finding counts, repository-state labels, and
the last retrieval error when one exists.

## Cold evidence

Cold transcript evidence is disabled by default. When explicitly enabled,
best-effort redacted session JSONL files and a manifest are written under the
episode's goal ID. They support local provenance and targeted debugging but
are never automatically replayed into model context.

`memory_evidence` returns only the bounded redacted manifest. Secret redaction
is best-effort, so enabling full transcript retention carries more privacy risk
than storing the distilled episode alone.
