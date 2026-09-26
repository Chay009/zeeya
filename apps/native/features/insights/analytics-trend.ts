/**
 * Trend chip for a SPENDING change: more spending is the warning colour,
 * less is the good-news colour.
 */
export function analyticsTrendChip(
  percent: number | null,
): { label: string; className: string } | null {
  if (percent === null || percent === 0) return null;
  if (percent > 0) {
    return { label: `↑ ${Math.abs(percent).toFixed(0)}%`, className: "text-negative" };
  }
  return { label: `↓ ${Math.abs(percent).toFixed(0)}%`, className: "text-positive" };
}
