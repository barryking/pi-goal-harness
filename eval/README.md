# Live evaluation

The live fixture measures the complete OpenAI Codex preset:

```text
Sol planning → Luna execution → Sol verification
```

It consumes provider quota and is intentionally excluded from ordinary CI.

## Prepare

Copy `fixtures/window` to a temporary directory, initialize it as a Git
repository, and create a private temporary Pi agent directory containing valid
provider authentication. Install this package into that isolated agent
directory.

Run the goal:

```text
node eval/rpc-goal-runner.mjs \
  --cwd <fixture-repo> \
  --objective "Harden normalizeWindow according to the project validation conventions, add comprehensive tests, and document the behavior. Keep the package dependency-free." \
  --output <result.json> \
  --session-dir <sessions> \
  --fresh-sessions on \
  --review-policy final \
  --step-verification executor-evidence \
  --extension /absolute/path/to/extensions/goala/index.ts
```

To evaluate authoritative PRD retention, copy the retained source fixture into
the temporary repository and register it:

```text
cp eval/fixtures/window-source-prd.md <fixture-repo>/PRD.md

node eval/rpc-goal-runner.mjs \
  --cwd <fixture-repo> \
  --objective "Implement the documented window-normalization contract." \
  --source PRD.md \
  --output <source-result.json> \
  --session-dir <source-sessions> \
  --fresh-sessions on \
  --review-policy final \
  --extension /absolute/path/to/extensions/goala/index.ts
```

The result records the captured source metadata in `goal.sources`. Run the
external hidden check afterward. Compare its quality and usage with a control
run from a clean fixture. Do not leave the PRD in the control repository,
because an unregistered file discovered during exploration would contaminate
the source-registration comparison.

Use `--review-policy per-step` to exercise human-review checkpoints with
executor validation evidence. Add `--step-verification independent` to invoke
the optional independent verifier before the runner approves each checkpoint.
Final independent goal verification remains mandatory in both cases.

`--extension` disables discovered extensions and loads that source file
directly, which is useful for evaluating an unreleased checkout.

Then run the checks independently:

```text
node eval/window-hidden-check.mjs <fixture-repo>
cd <fixture-repo>
npm test
git diff --check
```

Do not commit temporary authentication or raw session evidence.

## Recorded result

The sanitized summary from the historical pre-Dream local-memory experiment is
retained for provenance in
[`results/2026-07-25-verifier-grounded-memory.json`](results/2026-07-25-verifier-grounded-memory.json).
The source-backed PRD regression is retained in
[`results/2026-07-26-authoritative-source.json`](results/2026-07-26-authoritative-source.json).
Raw sessions remain ephemeral and are not committed.

Current evaluations do not seed or switch a Goala memory database. To exercise
the optional integration, install Dream in the isolated Pi home and manage the
fixture repository through Dream before starting the Goal. Goala will consume
only Dream's promoted read-only documents.
