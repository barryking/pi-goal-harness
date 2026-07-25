# Architecture

Pi Goal Harness is one Pi extension with three responsibilities:

1. persist a goal and its acceptance contract;
2. route work through plan, execute, verify, and repair phases;
3. retrieve and promote bounded verified memory.

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
criteria, review policy, plan, step-review evidence, progress, repair counts,
final verification report, memory references, and session evidence paths.

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
current-model preset is available for other providers.

If a configured model cannot be resolved and current-model fallback is
enabled, the harness uses the model that was active when the extension session
started and displays a warning.

## Completion invariant

A goal can enter `complete` only when:

- the harness is in verification phase;
- every plan step is completed and, under `per-step`, human-approved;
- the verifier submits at least one check;
- every check has status `pass`;
- every check has non-empty concrete evidence;
- the defects list is empty.

Memory promotion occurs only inside that same accepted PASS branch. Reusable
findings must be supplied by the independent verifier, include evidence, and
are distinct from planner or executor claims.
