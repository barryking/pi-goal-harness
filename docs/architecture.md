# Architecture

Pi Goal Harness is one Pi extension with three responsibilities:

1. persist a goal and its acceptance contract;
2. route work through plan, execute, verify, and repair phases;
3. retrieve and promote bounded verified memory.

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
                                  ready_for_verification
                                             |
                                             v
                                  isolated verifier context
                                      |             |
                                    PASS           FAIL
                                      |             |
                               promote memory   bounded repair
```

Goal state is stored as Pi custom session entries. It includes the objective,
criteria, plan, progress, repair count, verification report, memory references,
and session evidence paths.

## Phase contexts

| Phase | Included | Excluded |
|---|---|---|
| Planning | Objective and bounded verified recall | Old raw transcripts |
| Execution | Criteria, remaining steps, current defects, bounded recall | Completed-step evidence and planning transcript |
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
planning and verification, a faster model for implementation, and a balanced
fallback after repeated repair. A portable current-model preset is available
for other providers.

If a configured model cannot be resolved and current-model fallback is
enabled, the harness uses the model that was active when the extension session
started and displays a warning.

## Completion invariant

A goal can enter `complete` only when:

- the harness is in verification phase;
- the verifier submits at least one check;
- every check has status `pass`;
- the defects list is empty.

Memory promotion occurs only inside that same accepted PASS branch.
