/** 1-2-5 step used to pick chart axis ticks. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Top of a 4-step axis that still covers `maxValue`. */
export function axisMaxFor(maxValue: number): number {
  if (maxValue <= 0) return 0;
  const step = niceStep(maxValue / 4);
  const fourSteps = step * 4;
  return fourSteps >= maxValue ? fourSteps : step * 5;
}
