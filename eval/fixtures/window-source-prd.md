# Window normalization requirements

Bring `normalizeWindow(value, fallback)` in line with the project's strict
configuration parsing conventions.

## Acceptance contract

- Accept integer numbers and canonical unsigned decimal strings from 1 through
  3,600 inclusive.
- Accept leading zeroes in strings, so `"0060"` normalizes to `60`.
- When `value` is `undefined`, validate and normalize `fallback` using the same
  rules.
- Reject out-of-range values with `RangeError`.
- Reject booleans, fractional numbers, signed strings, surrounding whitespace,
  empty strings, `null`, arrays, and objects with `TypeError`.
- Keep the package dependency-free.
- Add comprehensive tests and document the public behavior.
