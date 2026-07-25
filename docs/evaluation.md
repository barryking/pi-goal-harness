# Evaluation

## Acceptance policy

A context or memory change is accepted only when:

1. public and hidden quality do not regress;
2. verifier independence remains intact;
3. stale or adversarial memory cannot override current evidence;
4. context size remains bounded;
5. token and cost measurements report cache reads separately.

## Static evaluation

The deterministic suite covers:

- verified episode storage and recall;
- content-hash deduplication;
- secret redaction;
- bounded injection;
- pruning of completed execution evidence;
- verifier memory isolation;
- per-step validation evidence and human approval gates;
- optional independent step verification;
- revision feedback and pause/resume at a review checkpoint;
- final-verifier repair after per-step execution;
- read-only enforcement before plan and step approval;
- namespaced paths and user-only file permissions.

The synthetic legacy executor packet measured 5,671 characters. The isolated
packet measured 1,437 characters, a 74.7% reduction.

## Paired live evaluation

Both runs started from the same dependency-free repository and objective. The
memory run received one relevant verified episode and one stale adversarial
episode.

| Measure | No memory | Verified memory | Change |
|---|---:|---:|---:|
| Public tests | 7 pass | 8 pass | No regression |
| Hidden contract | FAIL | PASS | Quality improved |
| Verifier | PASS | PASS | No regression |
| Repair cycles | 0 | 0 | Equal |
| Uncached input | 61,577 | 55,380 | -10.1% |
| Output | 5,488 | 5,693 | +3.7% |
| Cache read | 36,864 | 44,544 | +20.8% |
| Total | 103,929 | 105,617 | +1.6% |
| Reported cost | $0.310883 | $0.295532 | -4.9% |
| API calls | 20 | 20 | Equal |

The memory run selected the verified 1–3,600 contract, ignored the adversarial
instruction, and passed the hidden checks. The control inferred a 1–1,000
limit from nearby code and failed the hidden contract.

This demonstrates a quality improvement on the fixture, not universal token
savings. Total processed tokens rose slightly because cache reads increased.

## Exact-final regression

The final context-boundary revision passed:

- 7/7 public tests;
- the independent hidden contract;
- independent Sol verification;
- adversarial-memory resistance;
- zero repair cycles.

Usage was 43,476 uncached input, 5,381 output, 45,568 cache-read, and 94,425
total tokens across 22 calls, with reported cost of $0.278966.

## Per-step review evaluation

The same memory-backed fixture was run through two `per-step` variants. Both
passed the public suite, external hidden contract, adversarial-memory check,
and final Sol verification with zero repairs.

| Review flow | Total tokens | API calls | Reported cost | Hidden contract |
|---|---:|---:|---:|---:|
| Final-only reference | 94,425 | 22 | $0.278966 | PASS |
| Per-step plus independent verification at every checkpoint | 220,712 | 42 | $0.608280 | PASS |
| Per-step executor evidence plus human approval | 143,765 | 31 | $0.445892 | PASS |

The lean per-step flow added 52.3% total tokens, 40.9% calls, and 59.8%
reported cost relative to the final-only reference. Automatically buying an
independent model review at every checkpoint added 133.7% tokens and 118.0%
cost. Consequently, per-step mode now pauses with declared-check evidence and
keeps independent `/verify` optional at a checkpoint; independent final
verification remains mandatory.

These are individual model runs rather than statistically powered averages.
They demonstrate the direction and magnitude of the interaction-cost tradeoff,
not a universal multiplier.

## Packaged-install acceptance

The distributable package was installed through `pi install` into a clean,
isolated Pi agent directory. Before goal mode, it preserved the host's selected
model and other-extension tool set.

The installed package then ran the same adversarial-memory fixture:

- package discovery and offline Pi load passed;
- 6/6 generated public tests passed;
- the external hidden contract passed;
- independent Sol verification passed;
- stale adversarial memory was ignored;
- no repair cycle was needed;
- 98,184 total tokens were processed across 21 calls;
- reported cost was $0.339985.

The result snapshot was written to an ephemeral private evaluation directory;
the reusable fixture and runner are retained under `eval/`.

## Reproduction

Run the deterministic checks:

```text
npm test
```

The `eval/` fixture and RPC runner support live provider evaluations. Live
evaluations consume model quota and are not run in ordinary CI.
