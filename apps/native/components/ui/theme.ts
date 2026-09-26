import { useMemo } from "react";
import { useCSSVariable } from "uniwind";

import { useAppTheme } from "@/contexts/app-theme-context";

// Raw colour values for the places a className can't reach — SVG strokes,
// icon `color` props, chart series, shadows. They are READ from the tokens
// in global.css (the single source of truth), so light/dark and any palette
// change flow through automatically. Never add a hex literal here.

const TOKENS = {
  background: "--color-background",
  card: "--color-card",
  fill: "--color-fill",
  fillStrong: "--color-fill-strong",
  border: "--color-border",
  divider: "--color-divider",
  ink: "--color-ink",
  inkSoft: "--color-ink-soft",
  muted: "--color-muted",
  faint: "--color-faint",
  onInk: "--color-on-ink",
  accent: "--color-accent",
  onAccent: "--color-on-accent",
  accentDeep: "--color-accent-deep",
  accentSoft: "--color-accent-soft",
  positive: "--color-positive",
  positiveSoft: "--color-positive-soft",
  negative: "--color-negative",
  negativeSoft: "--color-negative-soft",
  warning: "--color-warning",
  warningSoft: "--color-warning-soft",
  hero: "--color-hero",
  onHero: "--color-on-hero",
  onHeroMuted: "--color-on-hero-muted",
  chartLine: "--color-chart-line",
  chart1: "--color-chart-1",
  chart2: "--color-chart-2",
  chart3: "--color-chart-3",
  chart4: "--color-chart-4",
  chart5: "--color-chart-5",
  chart6: "--color-chart-6",
  scrim: "--color-scrim",
} as const;

type TokenKey = keyof typeof TOKENS;

export type ThemeColors = Record<TokenKey, string> & {
  /** Categorical series, in order. */
  chart: readonly string[];
  isDark: boolean;
};

const TOKEN_KEYS = Object.keys(TOKENS) as TokenKey[];
const TOKEN_NAMES = TOKEN_KEYS.map((key) => TOKENS[key]);

export function useThemeColors(): ThemeColors {
  const { isDark } = useAppTheme();
  const values = useCSSVariable(TOKEN_NAMES) as (string | number | undefined)[];

  return useMemo(() => {
    const resolved = {} as Record<TokenKey, string>;
    TOKEN_KEYS.forEach((key, index) => {
      const value = values[index];
      resolved[key] = typeof value === "string" ? value : "transparent";
    });
    return {
      ...resolved,
      chart: [
        resolved.chart1,
        resolved.chart2,
        resolved.chart3,
        resolved.chart4,
        resolved.chart5,
        resolved.chart6,
      ],
      isDark,
    };
    // `values` is a fresh array each render; join makes the memo stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join("|"), isDark]);
}

/** Hex/rgb colour with an alpha applied, for tints built from a token. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = color.match(/rgba?\(([^,]+),([^,]+),([^,)]+)/);
  if (rgb) return `rgba(${rgb[1]!.trim()}, ${rgb[2]!.trim()}, ${rgb[3]!.trim()}, ${alpha})`;
  return color;
}

// Layout constants shared by every screen.
export const layout = {
  gutter: 20,
  sectionGap: 28,
  cardPadding: 20,
} as const;
