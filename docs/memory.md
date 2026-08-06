# Dream integration

Goala owns the Goal decision cycle. Dream owns durable memory. Either package
works on its own; when both are installed, Goala can consume Dream's generic
read-only memory API.

## CoALA placement

Goala remains CoALA-inspired, but it is not a complete memory product:

| Memory type | Current owner |
|---|---|
| Working | Goala's bounded phase-specific Goal context |
| Semantic | Pi-loaded `AGENTS.md`, repository code, tests, ADRs, and project documentation |
| Procedural | Pi skills and Goala's executable workflow |
| Episodic | Ordinary Pi sessions; Dream provides reviewed cross-session learning when installed |

Semantic memory does not require Dream. The repository remains the
authoritative source of project facts and decisions. Without Dream, Goala loses
learned cross-session guidance—not its ability to understand the current
project or complete the Goal lifecycle.

## What Goala reads

When `/goal` starts, Goala asks Dream to discover the current repository and
its Primary shared-memory Store, then performs one bounded search using the
Goal objective. It never searches unrelated Stores.

An interactive user can:

- use every hit as advisory guidance;
- review each hit and mark it advisory, binding, or skipped; or
- use no remembered guidance.

Non-interactive modes may select only the four highest-ranked hits and always
treat them as advisory.

Goala reads each selected document from the exact Store commit returned by
Dream. It records the Store ID, name, scope, commit, path, content hash,
authority, and content in an immutable Goal snapshot. At most eight documents
and 64,000 total characters are retained. A newer Dream promotion therefore
applies only to a new Goal.

Run `/goal context` for a persistent, high-contrast summary of the selected
references and what their advisory or binding authority means.

## Authority

Advisory guidance is a lead. Current repository files, tests, authoritative
Goal sources, and explicit user direction may override it; a material conflict
should be surfaced.

Binding guidance is an explicit Goal constraint. Planning must represent it in
the acceptance contract, execution must follow it, and independent
verification receives it alongside the Goal criteria. Advisory content is
excluded from verifier context.

The authority label belongs only to Goala. Dream exposes generic versioned
documents and has no Goal, phase, plan, or verification concepts.

## What Goala does not write

Passing or failing verification makes no Dream call. Goala sends no Goal,
execution graph, receipt, verifier finding, changed-file list, Candidate, or
special session group to Dream.

The work already exists in ordinary Pi sessions and in the repository. Dream
can later use its existing repository-scoped session flow to derive a normal
Candidate for explicit review and promotion.

## Standalone behaviour

If Dream is not installed, not initialized, or does not manage the current
repository, Goala continues planning, executing, repairing, and verifying.
`/goal context` shows that remembered guidance is unavailable or empty. A
provider error is surfaced as a warning and never falls back to another memory
store.

Goala contains no SQLite memory implementation, legacy database reader,
migration, memory command, memory model tool, or memory configuration. Any
files created by older releases are outside the current product contract and
are neither opened nor migrated.
