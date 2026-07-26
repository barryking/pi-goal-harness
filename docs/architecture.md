# Architecture

Goala is one Pi extension with three responsibilities:

1. persist a goal and its acceptance contract;
2. route work through planning, execution, independent verification, and a
   bounded repair loop;
3. retrieve and promote bounded verified memory.

## Module boundaries

The extension entry point is the workflow coordinator. Supporting modules each
own one concern:

| Module | Responsibility |
|---|---|
| `index.ts` | Commands, phase transitions, and event orchestration |
| `tools.ts` | Tool schemas and state transitions caused by tool submissions |
| `session.ts` | Fresh-session handoff and logical phase context slicing |
| `sources.ts` | Safe project-local source resolution, hashing, and drift detection |
| `policy.ts` | Read-only and high-risk tool-call enforcement |
| `presenters.ts` | Status, plan, and widget rendering |
| `context.ts` | Minimal phase-specific model context |
| `workflow.ts` | Goal-state types, normalization, and invariants |
| `memory.ts` | Verified episodic storage and retrieval |
| `recovery.ts` | Discovery of unfinished goals in saved Pi sessions |
| `routing.ts` | Model-role selection and fallback-executor activation |
| `setup.ts` | Interactive available-model selection for each lifecycle role |
| `config.ts` | Namespaced configuration and model-role presets |

Simple concern names are intentional: the directory already supplies the
`goala` context, so prefixes such as `phase-` and suffixes such as
`-boundary` add length without clarifying ownership.

Public commands, saved-session entries, phase markers, storage, and environment
variables all use the Goala namespace.

## Four-memory placement

The CoALA-inspired types are separated by responsibility:

| Type | Owner |
|---|---|
| Working | Phase-specific context assembled by this extension |
| Semantic | Pi-loaded `AGENTS.md` and version-controlled project documentation |
| Procedural | Pi skills and this extension's executable workflow |
| Episodic | Distilled, verifier-grounded prior-task episodes in SQLite |

SQLite is not a replacement for project knowledge or skills. Entire-inspired
session evidence and commit linkage provide provenance for an episode; the
smaller recalled packet contains only the parts useful to a later task.

## Lifecycle

```text
/goal
  |
  v
clean planning session -- submit_plan --> awaiting explicit /execute
                                             |
                                             v
                                  clean execution session
                                             |
                       +---------------------+----------------------+
                       | final review policy | per-step review      |
                       v                     v                      |
             ready_for_verification    run declared checks         |
                       |                     |                      |
                       |               awaiting human review       |
                       |          optional /verify | approve/revise |
                       |                 +--------> next / rework --+
                       v
             isolated final verifier context
                                      |             |
                                    PASS           FAIL
                                      |             |
                               promote memory   bounded repair
```

Goal state is stored as Pi custom session entries. It includes the objective,
authoritative source paths and hashes, criteria, review policy, plan,
step-review evidence, progress, repair counts, final verification report,
memory references, and session evidence paths.

The state remains attached to the saved Pi session tree. A plain `pi` launch
starts a new session rather than automatically adopting another session's
goal. From an idle session, `/goal-status` performs bounded, read-only recovery
discovery over recent sessions for the same filesystem working directory. It
deduplicates phase handoffs by goal ID, ignores completed or superseded state,
and presents an explicit `pi --session <id>` command. It never switches
sessions automatically because multiple unfinished goals may legitimately
coexist.

## Phase contexts

| Phase | Included | Excluded |
|---|---|---|
| Planning | Objective and bounded verified recall | Old raw transcripts |
| Execution | Criteria, remaining steps, current defects, bounded recall | Completed-step evidence and planning transcript |
| Step verification | Current step and its verification method | Recalled memory and executor claims |
| Human review | Verified step summary and read-only repository access | Editing and later-step execution |
| Verification | Objective, criteria, verification methods, current observations | Recalled memory and executor claims |
| Repair | Remaining work and latest defects | Superseded completion evidence |

Authoritative source documents are represented by project-relative paths,
byte counts, and SHA-256 hashes. Their full contents are not copied into phase
context. Each active phase receives the bounded references and reads the
current files through Pi's normal repository tools. Before each agent turn,
Goala compares current content with the captured hash; missing or changed
sources create an explicit contract-drift warning and block workflow
submissions. Restoring the captured file or starting a replacement goal is an
explicit contract decision.

Planning and execution use physical Pi session replacement in interactive/RPC
mode. Automatic verification occurs inside the execution session because
replacing a session from an active model callback can deadlock the runtime. A
context hook slices provider-visible messages from the newest signed phase
marker, providing the clean logical boundary without discarding local
provenance.

## Model routing

Roles are configured separately. The bundled preset uses a stronger model for
planning and final verification, a faster model for implementation and routine
step verification, and a balanced fallback after repeated repair. Independent
step context and the final strong verifier preserve the trust boundary without
paying the strongest-model cost at every human checkpoint. A portable
current-model preset is available for other providers. The advanced setup
defaults to retaining each role, supports reasoning-only changes, and filters
models after provider selection. It stores provider, model, and reasoning
independently for every role only after final review; mixed-provider workflows
therefore use the same phase-routing path as the bundled preset.

If a configured model cannot be resolved and current-model fallback is
enabled, Goala uses the model that was active when the extension session
started and displays a warning.

## Completion invariant

A goal can enter `complete` only when:

- Goala is in verification phase;
- every plan step is completed and, under `per-step`, human-approved;
- the verifier submits at least one check;
- every check has status `pass`;
- every check has non-empty concrete evidence;
- the defects list is empty.

Memory promotion occurs only inside that same accepted PASS branch. Reusable
findings must be supplied by the independent verifier, include evidence, and
are distinct from planner or executor claims.
