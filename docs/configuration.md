# Configuration

Configuration is stored at:

```text
~/.pi/agent/pi-goal-harness/config.json
```

The package does not modify Pi's main settings, authentication, model list,
skills, prompts, or other packages.

## Clean migration and rollback

A reset is not required for an ordinary installation: Pi Goal Harness is
namespaced and can coexist with other Pi configuration. A clean migration is
useful when replacing an older hand-maintained harness or when you explicitly
want to remove inherited skills, prompts, model overrides, and extensions.

For a recoverable clean migration:

1. Exit every running Pi process.
2. Move the complete `~/.pi/agent/` directory to a timestamped backup outside
   the active path. Do not delete it.
3. Create a new `~/.pi/agent/` directory with `0700` permissions.
4. Copy only `auth.json` from the backup into the new directory and keep it at
   `0600`. Restore other files only after deciding they are still required.
5. Install a pinned release:

   ```text
   pi install git:github.com/barryking/pi-goal-harness@v0.1.1
   ```

6. Confirm `pi list` shows the pinned package, then start Pi and run
   `/goal-status` and `/memory-status`.

This approach preserves old sessions, configuration, and harness data in the
backup while preventing them from silently influencing the clean
installation. To roll back, exit Pi, move the new agent directory aside, and
restore the backup to `~/.pi/agent/`.

## Interactive setup

```text
/harness-setup
/harness-setup status
/harness-setup openai
/harness-setup current
```

`openai` selects the tested Sol/Luna/Terra model split when those models are
available. `current` assigns the model active at Pi startup to every role.

## Full schema

```json
{
  "configVersion": 1,
  "provider": "openai-codex",
  "planner": {
    "model": "gpt-5.6-sol",
    "thinkingLevel": "medium"
  },
  "executor": {
    "model": "gpt-5.6-luna",
    "thinkingLevel": "medium"
  },
  "fallbackExecutor": {
    "model": "gpt-5.6-terra",
    "thinkingLevel": "medium",
    "afterRepairCycle": 2
  },
  "verifier": {
    "model": "gpt-5.6-sol",
    "thinkingLevel": "medium"
  },
  "autoVerify": true,
  "maxRepairCycles": 3,
  "freshSessionPerPhase": true,
  "allowCurrentModelFallback": true,
  "memory": {
    "enabled": true,
    "autoRecall": true,
    "maxResults": 4,
    "maxInjectedChars": 6000,
    "maxResultChars": 900,
    "storeColdEvidence": true
  }
}
```

Restart Pi or use `/reload` after manually editing the file.

## Environment overrides

These are primarily useful for CI and isolated evaluation:

```text
PI_GOAL_HARNESS_HOME=<namespaced data directory>
PI_HARNESS_MEMORY_ROOT=<memory-only directory>
PI_HARNESS_MEMORY_ENABLED=0|1
PI_HARNESS_FRESH_SESSIONS=0|1
```

## Uninstall

Remove the package using the same source identity used during installation:

```text
pi remove git:github.com/barryking/pi-goal-harness
```

Package removal does not delete `~/.pi/agent/pi-goal-harness/`. This preserves
configuration and verified memory for reinstall or manual backup. Remove that
directory separately only when its data is no longer needed.
