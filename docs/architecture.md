# Architecture

Goala is one Pi extension with three responsibilities:

1. persist a goal and its acceptance contract;
2. route work through planning, execution, independent verification, and a
   bounded repair loop;
3. optionally capture bounded, versioned guidance from Dream when a Goal begins.

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
| `dream.ts` | Optional read-only adapter to Dream's generic interop API |
| `recovery.ts` | Discovery of unfinished goals in saved Pi sessions |
| `routing.ts` | Model-role selection and fallback-executor activation |
| `setup.ts` | Interactive available-model selection for each lifecycle role |
| `config.ts` | Namespaced configuration and model-role presets |

Simple concern names are intentional: the directory already supplies the
`goala` context, so prefixes such as `phase-` and suffixes such as
`-boundary` add length without clarifying ownership.

Public commands, saved-session entries, phase markers, and environment variables
all use the Goala namespace.

## Memory boundary

The CoALA-inspired types are separated by responsibility:

| Type | Owner |
|---|---|
| Working | Phase-specific context assembled by this extension |
| Semantic | Pi-loaded `AGENTS.md` and version-controlled project documentation |
| Procedural | Pi skills and this extension's executable workflow |
| Episodic | Dream, when installed; Goala only consumes selected promoted documents |

Goala does not own durable episodic storage. `dream.ts` dynamically loads only
`pi-dream/interop`, performs one search at Goal creation, reads selected exact
versions, and stores a 64,000-character maximum snapshot in Goal state. Dream
has no Goal or phase concepts, and Goala never calls a Dream write path.

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
                                  complete      bounded repair
```

Goal state is stored as Pi custom session entries. It includes the objective,
authoritative source paths and hashes, criteria, review policy, plan,
step-review evidence, progress, repair counts, final verification report,
selected Dream document snapshots, and session evidence paths.

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
| Planning | Objective and selected advisory/binding guidance | Old raw transcripts |
| Execution | Criteria, remaining steps, current defects, selected guidance | Completed-step evidence and planning transcript |
| Step verification | Current step, its verification method, and binding guidance | Advisory guidance and executor claims |
| Human review | Verified step summary and read-only repository access | Editing and later-step execution |
| Verification | Objective, criteria, methods, current observations, and binding guidance | Advisory guidance and executor claims |
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

Every role follows the model selected by Pi at session startup by default. This
is a dynamic reference rather than a copied provider/model name. The active Pi
reasoning setting is clamped using the model's `reasoning` and
`thinkingLevelMap` metadata, so non-reasoning models run with reasoning off and
unsupported levels are never requested.

Advanced setup can pin provider, model, and reasoning independently for any
role while leaving the remaining roles attached to Pi's default. The setup UI
offers only reasoning levels supported by the selected model. Independent
step context and final verification preserve the trust boundary regardless of
whether roles share one model or use a mixed-provider configuration.

If a pinned model cannot be resolved and default-model fallback is enabled,
Goala uses Pi's session-default model and displays a warning.

## Completion invariant

A goal can enter `complete` only when:

- Goala is in verification phase;
- every plan step is completed and, under `per-step`, human-approved;
- the verifier submits at least one check;
- every check has status `pass`;
- every check has non-empty concrete evidence;
- the defects list is empty.

Completion writes only Goala Goal state and ordinary Pi session entries. It
does not create a memory record, Dream Candidate, receipt, or execution graph.
