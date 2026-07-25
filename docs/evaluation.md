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
