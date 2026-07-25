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
  --fresh-sessions on
```

Then run the checks independently:

```text
node eval/window-hidden-check.mjs <fixture-repo>
cd <fixture-repo>
npm test
git diff --check
```

Do not commit temporary authentication or raw session evidence.
