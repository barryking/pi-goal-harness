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

## Memory

- Durable memory is written only after verifier PASS.
- Recall is treated as untrusted data.
- Common secret formats are redacted.
- Storage is namespaced and user-readable only.
- Raw evidence is not automatically injected.

Secret scanning is pattern based and cannot guarantee removal of arbitrary
credentials embedded in prose.

## User approval

`/execute` approves the stored plan, not unrelated changes. The extension does
not send messages, push commits, publish packages, deploy software, or modify
external systems on its own.
