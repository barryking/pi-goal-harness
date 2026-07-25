# Configuration

Configuration is stored at:

```text
~/.pi/agent/pi-goal-harness/config.json
```

The package does not modify Pi's main settings, authentication, model list,
skills, prompts, or other packages.

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
