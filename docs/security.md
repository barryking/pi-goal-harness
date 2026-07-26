# Security and limitations

## Extension authority

Pi extensions execute with the permissions of the Pi process. Phase tool lists,
read-only command checks, and interactive high-risk confirmations are defense
in depth—not a sandbox or security boundary.

Use containerization or another operating-system boundary for untrusted
repositories and high-risk tasks.

## Phase restrictions

- Planning blocks edit/write tools and non-allow-listed shell commands.
- Verification blocks edit/write tools and recognized mutating commands.
- Execution permits normal coding operations.
- Destructive Git operations, recursive forced removal, publishing, deployment,
  infrastructure mutation, `sudo`, and shutdown require confirmation.
- High-risk commands are blocked when no interactive UI is available.

Pattern checks cannot understand every shell language construct. Review the
plan and confirmations.

## Authoritative sources

Goal sources must resolve to bounded UTF-8 files inside the current project.
Paths, byte counts, and hashes are persisted; contents remain in the project
and are read by the model. Register only trusted requirement documents. A
source file can contain instructions with the same authority as the goal, so
project containment is not a substitute for repository trust.

Source drift blocks workflow submissions but does not prevent an executor from
editing the file. Do not register a document that the implementation is
expected to rewrite; intentionally revised contracts should be approved through
a replacement goal.

## Memory

- Durable episodes are written only after verifier PASS, and reusable findings
  come from that verifier's own evidence.
- Recall is treated as untrusted data.
- Common secret formats are redacted.
- Storage is namespaced and user-readable only.
- Raw evidence is not automatically injected; full transcript retention is
  disabled by default.

Secret scanning is pattern based and cannot guarantee removal of arbitrary
credentials embedded in prose.

## User approval

`/execute` approves the stored plan, not unrelated changes. The extension does
not send messages, push commits, publish packages, deploy software, or modify
external systems on its own.
