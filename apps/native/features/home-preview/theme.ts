import { useAppTheme } from "@/contexts/app-theme-context";

// Zeeya's palette for code that styles with a style object instead of a
// className. Plain constants: read at module scope, no lookup, no runtime.
// The same values are declared as CSS variables in global.css for className
// styling and for HeroUI's own components.
//
// ── Green family (read before picking a token) ───────────────────────────
//
// Zeeya is a GREEN brand. Lime is one member of the family — not the default
// for every control. Using lime for fills, soft backgrounds, and link text at
// once washes the whole screen out.
//
//   lime (#c9ef69) = accent fill
//     Primary interactive FILL: selected tab pill, switch on, filled CTA.
//     Always pair with onAccent (near-black ink) — never white on lime.
//     Tailwind: bg-accent + text-on-accent (black). Never text-on-ink on lime.
//
//   onAccent (#101014)
//     Text/icons on a lime (accent) fill. Tailwind: text-on-accent.
//
//   accentDeep / forest (#0a5c2e)
//     Interactive TEXT on white: links, "+N more", retry, selected chip label.
//     Tailwind: text-accent-deep, text-forest.
//
//   accentSoft / surfaceMint (#eaf7ef)
//     Tinted highlight SURFACE behind a row or icon circle — mint, not lime.
//     Tailwind: bg-accent-soft, bg-surface-mint.
//
//   positive / emerald (#12a150)
//     Money IN only. Never reuse for chrome; income amounts stay semantic.
//
//   Surfaces stay neutral (white / soft grey). Green earns its place.
//
// ── Non-green ────────────────────────────────────────────────────────────
//   coral — money out. Category hues — spending breakdown only.
export const hp = {
  // --- surfaces -----------------------------------------------------------
  background: "#f4f4f6",
  card: "#ffffff",
  cardAlt: "#f4f4f6",
  surfaceMuted: "#f2f2f5",
  surfaceOnLight: "#ffffff",
  border: "#e6e6eb",
  borderSoft: "#eeeef2",
  divider: "#f0f0f3",
  track: "#ececf0",

  // --- ink ----------------------------------------------------------------
  ink: "#101014",
  inkDeep: "#1c1c22",
  inkSoft: "#4a4a55",
  muted: "#6e6e7a",
  mutedSoft: "#8b8b96",
  faint: "#adadb8",
  onInk: "#ffffff",

  // --- brand green family -------------------------------------------------
  // Lime interactive fill — bg-accent, HeroUI --accent, focus rings.
  accent: "#c9ef69",
  // Text on lime fill — never white; the signature Zeeya combo.
  onAccent: "#101014",
  // Interactive text on white — text-accent-deep, links, labels on soft bg.
  accentDeep: "#0a5c2e",
  // Highlight surface — bg-accent-soft; mint tint, not lime wash.
  accentSoft: "#eaf7ef",
  // Alias for accent — chart spark, inline styles that mean "the lime".
  lime: "#c9ef69",

  // --- money --------------------------------------------------------------
  positive: "#12a150",
  positiveDeep: "#0e8442",
  negative: "#e5484d",
  danger: "#e5484d",
  coral: "#e5484d",
  coralBar: "#f0736f",
  expenseBg: "#ffeceb",

  heroSurface: "#141419",
  heroSurfaceSoft: "#22222b",

  // --- status tints -------------------------------------------------------
  recurringBg: "#eaf7ef",
  recurringInk: "#0a5c2e",
  manualBg: "#fff4e5",
  manualInk: "#b25e09",
  calculatedBg: "#fff4e5",
  calculatedInk: "#b25e09",
  chipBg: "#f2f2f5",

  // --- legacy green names (map to the family above) -----------------------
  emerald: "#12a150",
  emeraldDeep: "#0e8442",
  mint: "#12a150",
  mintLight: "#3cc46f",
  inkForest: "#101014",
  forest: "#0a5c2e",
  forestSoft: "#4a4a55",
  sage: "#6e6e7a",
  sageSoft: "#8b8b96",
  sageFaint: "#8b8b96",
  sageMuted: "#adadb8",
  sageDisabled: "#cdcdd6",
  shadowForest: "#101014",
  surfaceSage: "#f2f2f5",
  surfaceSageAlt: "#f4f4f6",
  surfaceMint: "#eaf7ef",
  surfaceMintAlt: "#f2f2f5",
  borderSage: "#e6e6eb",
  noticeBg: "#eaf7ef",
  noticeBorder: "#c5e6d0",
  noticeInk: "#0a5c2e",

  categoryLegend: ["#12a150", "#3cc46f", "#f5a524", "#f76808", "#0090ff", "#12a594"],
} as const;

export const FLOATING_TAB_BAR_CLEARANCE = 90;

export const homeSpacing = { xs: 8, sm: 12, md: 16, lg: 24 } as const;
export const homeRadius = { tile: 16, card: 24, hero: 28 } as const;

export type HomePalette = {
  [K in keyof typeof hp]: K extends "categoryLegend" ? readonly string[] : string;
};

export const hpDark = {
  ...hp,
  background: "#111116",
  card: "#1c1c24",
  cardAlt: "#22222b",
  surfaceMuted: "#22222b",
  surfaceOnLight: "#1c1c24",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.1)",
  divider: "rgba(255,255,255,0.08)",
  track: "#2f2f3a",
  ink: "#f7f7fa",
  inkDeep: "#ffffff",
  inkSoft: "#d0d0da",
  muted: "#b4b4c1",
  mutedSoft: "#8f8f9c",
  faint: "#6e6e7a",
  onInk: "#111116",
  // Lime fill on dark cards — still pairs with near-black label text.
  accent: "#c9ef69",
  onAccent: "#101014",
  // Link / label text on dark surfaces without a lime fill behind them.
  accentDeep: "#daf99d",
  accentSoft: "rgba(60, 196, 111, 0.14)",
  heroSurface: "#0d0d12",
  heroSurfaceSoft: "#1a1a22",
  chipBg: "#2a2a34",
  noticeBg: "rgba(60, 196, 111, 0.12)",
  noticeBorder: "rgba(60, 196, 111, 0.28)",
  noticeInk: "#c9ef69",
} as HomePalette;

export function useHomePalette(): HomePalette {
  const { isDark } = useAppTheme();
  return isDark ? hpDark : hp;
}
