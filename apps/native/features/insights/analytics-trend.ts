/** Trend chips match the mock: up = green, down = coral. */
export function analyticsTrendChip(
  percent: number | null,
): { label: string; className: string } | null {
  if (percent === null || percent === 0) return null;
  if (percent > 0) {
    return { label: `↑ ${Math.abs(percent).toFixed(0)}%`, className: "text-positive" };
  }
  return { label: `↓ ${Math.abs(percent).toFixed(0)}%`, className: "text-coral" };
}
