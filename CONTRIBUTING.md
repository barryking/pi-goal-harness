# Contributing

Contributions are welcome after the public repository opens.

## Development

```text
npm install
npm run check
```

Changes to context selection or memory retrieval must include:

1. a deterministic regression test;
2. a quality comparison on the included fixture;
3. separate uncached-input, output, cache-read, total-token, and cost reporting;
4. confirmation that the verifier receives no recalled memory.

Do not weaken the independent verification boundary to improve a token metric.

## Pull requests

Keep pull requests focused. Explain the user-visible behavior, trust-boundary
impact, tests run, and any migration required for existing memory or
configuration.
