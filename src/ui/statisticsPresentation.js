export function hasStatisticValue(value) {
  return value !== null && value !== undefined;
}

export function formatStandardDeviation(value) {
  return Number.isFinite(value) ? String(value) : 'n/a';
}
