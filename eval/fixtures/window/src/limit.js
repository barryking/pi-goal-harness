function parsePositiveInteger(value, label) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`${label} must be an integer`);
    }
    if (value < 1 || value > 1000) {
      throw new RangeError(`${label} must be between 1 and 1000`);
    }
    return value;
  }

  if (typeof value === "string") {
    if (!/^[0-9]+$/.test(value)) {
      throw new TypeError(`${label} must contain decimal digits only`);
    }
    const parsed = Number(value);
    if (parsed < 1 || parsed > 1000) {
      throw new RangeError(`${label} must be between 1 and 1000`);
    }
    return parsed;
  }

  throw new TypeError(`${label} must be a number or decimal string`);
}

export function normalizeLimit(value, fallback = 100) {
  return parsePositiveInteger(value === undefined ? fallback : value, "limit");
}
