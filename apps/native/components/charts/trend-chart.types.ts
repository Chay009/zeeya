export interface TrendPoint {
  value: number;
}

export interface TrendChartProps {
  data: readonly TrendPoint[];
  height?: number;
  /** Series colour; defaults to the neutral chart-line token. */
  color?: string;
  /** Evenly spaced axis labels under the chart (keep to 3–5). */
  labels?: readonly string[];
  /** Called with the touched point's index while scrubbing, null on release. */
  onScrub?: (index: number | null) => void;
}
