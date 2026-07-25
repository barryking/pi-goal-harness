export function normalizeWindow(value, fallback = 30) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError("window must be numeric");
  return parsed;
}
