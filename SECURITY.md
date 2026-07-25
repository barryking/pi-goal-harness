# Security policy

## Trust model

Pi Goal Harness is a Pi extension and therefore runs with the permissions of
the user who starts Pi. Its command checks and phase-specific tool lists reduce
accidental changes; they are not an operating-system sandbox.

Install only reviewed releases. Use Pi inside a container or other external
sandbox when the repository or task requires a stronger boundary.

## Memory and secrets

Verified memory and redacted transcript evidence are stored locally under
`~/.pi/agent/pi-goal-harness/` by default. Common API keys, bearer tokens,
password assignments, private keys, and credential-bearing database URLs are
redacted before persistence.

Pattern-based redaction cannot guarantee removal of every possible secret.
Do not place credentials in goals, prompts, source files, test output, or
memory notes.

## Reporting a vulnerability

Before a public repository is created, report vulnerabilities privately to the
maintainer. The repository's GitHub Security Advisories page will become the
preferred reporting channel after publication.
