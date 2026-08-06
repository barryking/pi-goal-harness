# Configuration

Configuration is stored at:

```text
~/.pi/agent/pi-goala/config.json
```

The package does not modify Pi's main settings, authentication, model list,
skills, prompts, or other packages.

## Clean migration and rollback

A reset is not required for an ordinary installation: Goala is
namespaced and can coexist with other Pi configuration. A clean migration is
useful when replacing an older hand-maintained workflow or when you explicitly
want to remove inherited skills, prompts, model overrides, and extensions.

For a recoverable clean migration:

1. Exit every running Pi process.
2. Move the complete `~/.pi/agent/` directory to a timestamped backup outside
   the active path. Do not delete it.
3. Create a new `~/.pi/agent/` directory with `0700` permissions.
4. Copy only `auth.json` from the backup into the new directory and keep it at
   `0600`. Do not copy session files, settings, prompts, skills, extensions, or
   previous workflow data into the clean installation.
5. Install the current npm release:

   ```text
   pi install npm:pi-goala
   ```

6. Confirm `pi list` shows the package, then start Pi and run `/goal-status`.

This approach preserves old sessions, configuration, and workflow data only in
the backup for rollback. They are not migrated into or available from the
clean installation. To roll back, exit Pi, move the new agent directory aside,
and restore the backup to `~/.pi/agent/`.

## Interactive setup

```text
/goala-setup
/goala-setup status
/goala-setup default
/goala-setup custom
```

`default` makes every role follow the model selected by Pi at session startup.
This is a dynamic reference: Goala does not copy or pin that model name.
`custom` reviews each role and defaults to keeping its current configuration.
It can pin a provider/model and reasoning level for selected roles while
leaving the others on Pi's default. Provider selection is skipped when only
one provider is available. Reasoning choices come from the selected model's
Pi `models.json` metadata; unsupported levels are not offered, and
non-reasoning models use `off`. The final summary can be edited, saved, or
cancelled. Cancelling any prompt leaves the existing configuration unchanged.

## Full schema

```json
{
  "configVersion": 4,
  "planner": { "kind": "pi-default" },
  "executor": { "kind": "pi-default" },
  "fallbackExecutor": {
    "kind": "pi-default",
    "afterRepairCycle": 2
  },
  "stepVerifier": { "kind": "pi-default" },
  "verifier": { "kind": "pi-default" },
  "reviewPolicy": "final",
  "autoVerify": true,
  "maxRepairCycles": 3,
  "freshSessionPerPhase": true,
  "allowCurrentModelFallback": true
}
```

An explicitly pinned role has this shape:

```json
{
  "kind": "fixed",
  "provider": "your-provider",
  "model": "your-model-id",
  "thinkingLevel": "medium"
}
```

At runtime Goala clamps a fixed reasoning level to the selected model's
supported levels. This also protects a manually edited configuration when the
provider's model metadata changes.

`fallbackExecutor` is not a separate lifecycle phase. It replaces the normal
executor inside the repair loop after repeated verification failures.
`afterRepairCycle` is the number of failed verification attempts that activates
it. With the default value of `2`, the first repair still uses the normal
executor; after the repaired work fails verification again, subsequent
execution uses the fallback executor.

Restart Pi or use `/reload` after manually editing the file.

Version 1 configuration used one top-level `provider`; profiles containing a
model are migrated to fixed version 4 profiles. Version 2 could contain local
memory settings. Version 3 profiles are also migrated to fixed profiles. Goala
writes only version 4 and deliberately drops the obsolete top-level `provider`
and `memory` fields when configuration is next saved. Missing roles become Pi
defaults instead of inheriting a vendor-specific model.

`reviewPolicy` accepts:

- `final`: run the full approved plan and review the final result;
- `per-step`: run each plan step's declared checks, then pause with evidence
  for human approval or revision. `/verify` adds an optional independent
  checkpoint review.

The policy can be overridden for one goal with `/execute final` or
`/execute per-step`.

## Authoritative goal sources

Register detailed requirements or architecture contracts when starting a goal:

```text
/goal --source docs/PRD.md -- Implement the offline export workflow
```

Repeat `--source` for up to eight UTF-8 project files. Each file is limited to
1,000,000 bytes and must resolve inside the current working directory. The
Goala stores only its relative path, byte count, and SHA-256 hash in goal
state. Source contents remain in the repository and are read on demand by each
phase. There is no configuration switch because source registration is
explicit per goal.

## Environment overrides

These are primarily useful for CI and isolated evaluation:

```text
PI_GOALA_HOME=<namespaced data directory>
PI_GOALA_FRESH_SESSIONS=0|1
PI_GOALA_REVIEW_POLICY=final|per-step
```

## Uninstall

Remove the package using the same source identity used during installation:

```text
pi remove npm:pi-goala
```

Package removal does not delete `~/.pi/agent/pi-goala/`. This preserves
configuration for reinstall or manual backup. Remove that directory separately
only when its data is no longer needed.

Goala no longer reads or migrates SQLite databases or evidence directories
created by older releases. There is no legacy memory compatibility setting.
