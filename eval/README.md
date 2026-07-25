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

Seed the relevant and adversarial memories:

```text
node --import tsx eval/seed-window-memory.ts <fixture-repo> <memory-root>
```

Run the goal:

```text
node eval/rpc-goal-runner.mjs \
  --cwd <fixture-repo> \
  --objective "Harden normalizeWindow according to the project validation conventions, add comprehensive tests, and document the behavior. Keep the package dependency-free." \
  --output <result.json> \
  --session-dir <sessions> \
  --memory on \
  --memory-root <memory-root> \
  --fresh-sessions on \
  --review-policy final \
  --step-verification executor-evidence \
  --extension /absolute/path/to/extensions/goal-harness/index.ts
```

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

The sanitized summary from the verifier-grounded formation and organic-reuse
regression is retained in
[`results/2026-07-25-verifier-grounded-memory.json`](results/2026-07-25-verifier-grounded-memory.json).
Raw sessions remain ephemeral and are not committed.
