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

## Dream guidance

- The Dream dependency is optional and dynamically loaded through its public
  read-only interop entry point.
- Only the current repository and its Primary shared-memory Store are searched.
- Selected documents are pinned by Store commit, path, and SHA-256 hash.
- Goal state accepts at most eight documents and 64,000 total characters.
- Advisory guidance is treated as untrusted evidence; only explicitly selected
  binding guidance reaches independent verification.
- Dream document content is model-visible. Promote only material appropriate
  for later agent use.

Goala does not redact Dream content, write Dream data, or keep a second memory
database. Dream remains responsible for Store safety and promotion review.

## User approval

`/execute` approves the stored plan, not unrelated changes. The extension does
not send messages, push commits, publish packages, deploy software, or modify
external systems on its own.
