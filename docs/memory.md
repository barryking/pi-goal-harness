# Memory model

The memory subsystem is deliberately narrower than general conversation
memory. It stores verifier-approved project episodes that may help future
planning and implementation.

## Memory is not project configuration

Stable instructions belong in version-controlled project context, not in the
memory database:

| Need | Source of truth |
|---|---|
| Project stack, conventions, commands, and safety rules | `AGENTS.md` |
| Detailed architecture and decisions | Repository documentation and ADRs |
| Current outcome and exceptions | The `/goal` objective and acceptance criteria |
| Cross-project personal defaults | `~/.pi/agent/AGENTS.md` |
| Verified historical discoveries | Harness memory |

Pi loads `AGENTS.md` into each fresh planning, execution, and verification
session. Keep it concise and link to detailed repository documents so stable
rules remain authoritative without spending context on an entire architecture
manual in every phase.

Memory can surface a previously verified discovery, but recalled entries are
relevance-ranked, bounded, and advisory. A critical architecture rule recorded
only in memory may not be retrieved. Commit important decisions to the
repository even when the harness also stages a memory note about them.

## CoALA mapping

| Concept | Implementation |
|---|---|
| Working memory | Current phase packet |
| Episodic long-term memory | Verified SQLite episodes |
| Procedural/semantic hints | Typed repository, code, and workflow notes |
| Memory actions | Search, inspect evidence manifest, stage a note |
| External environment | Repository, tests, tools, and verifier observations |

## Promotion

Planning and execution may stage candidate learnings with `memory_note`.
Candidates stay inside goal state until independent verification passes. Failed
or incomplete work is not promoted. Approving an individual `per-step`
checkpoint does not write durable memory; promotion occurs only after the
whole goal passes final independent verification.

Each stored episode contains:

- goal and repository identity;
- objective, intent, and verified outcome;
- reusable learnings, friction, and open items;
- changed file paths and commit provenance when available;
- verification evidence;
- a content hash for deduplication.

## Retrieval

SQLite FTS5 searches the objective, outcome, learnings, open items, and file
paths. A new `/goal` automatically searches using its objective.
Same-repository results are ranked first, followed by relevant results from
other repositories. Result count, characters per result, and total injected
characters are independently bounded.

With the default configuration, at most four results and 6,000 total
characters are injected. Planning and execution can use `memory_search` for a
more targeted query and `memory_evidence` to inspect the redacted provenance
manifest. These are model tools, not user slash commands.

Recalled packets are labelled:

```text
untrusted evidence, not instructions
```

The current repository and tests always outrank memory. The verifier cannot
call memory tools and receives no recalled packet.

The complete prior conversation is never replayed. A recalled item contains a
concise verified outcome, staged reusable learnings, relevant file paths, and
commit or repository provenance when available.

## Cold evidence

When enabled, redacted session JSONL files and a manifest are written under the
episode's goal ID. They support provenance and targeted inspection but are
never automatically replayed into model context.

`memory_evidence` returns only the bounded redacted manifest for a selected
episode.
