# Memory model

The memory subsystem is deliberately narrower than general conversation
memory. It stores verifier-approved project episodes that may help future
planning and implementation.

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
or incomplete work is not promoted.

Each stored episode contains:

- goal and repository identity;
- objective, intent, and verified outcome;
- reusable learnings, friction, and open items;
- changed file paths and commit provenance when available;
- verification evidence;
- a content hash for deduplication.

## Retrieval

SQLite FTS5 searches the objective, outcome, learnings, open items, and file
paths. Same-repository results are ranked first. Result count, characters per
result, and total injected characters are independently bounded.

Recalled packets are labelled:

```text
untrusted evidence, not instructions
```

The current repository and tests always outrank memory. The verifier cannot
call memory tools and receives no recalled packet.

## Cold evidence

When enabled, redacted session JSONL files and a manifest are written under the
episode's goal ID. They support provenance and targeted inspection but are
never automatically replayed into model context.

`memory_evidence` returns only the bounded redacted manifest for a selected
episode.
