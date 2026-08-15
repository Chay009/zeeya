// A warm, dark finance-app palette — deliberately not the shared shadcn
// neutral theme in packages/ui/globals.css (used elsewhere in the app), so
// this stays scoped to the transaction dashboard rather than restyling the
// whole app. Named generically (not tied to any external brand) since only
// the general dark-warm/coral-accent visual language is being drawn from,
// not any copyrighted artwork or logos.
export const dashboardTheme = {
  background: "#1c1410",
  surface: "#2a1f1a",
  surfaceMuted: "#241b16",
  border: "#3a2c24",
  accent: "#e08a6f",
  accentMuted: "#4a3226",
  positive: "#5fbf7a",
  negative: "#e86a5c",
  textPrimary: "#f5ece5",
  textMuted: "#a68f82",
  badgeOlive: "#4a4526",
  badgeOliveText: "#d9c97a",
} as const;

export const categoryColors: Record<string, string> = {
  food: "#e8946a",
  fuel: "#c98a4a",
  entertainment: "#a06fe0",
  travel: "#5fa8bf",
  "e-commerce": "#e0b06f",
  shopping: "#e0b06f",
  medical: "#6fbf9e",
  payments: "#6f9ee0",
  monetary: "#6f9ee0",
  hospitality: "#bf8a6f",
  automobile: "#8a8fa0",
  fashion: "#d97fa0",
  cosmetics: "#d97fa0",
};

export function colorForCategory(category: string | null): string {
  if (!category) return dashboardTheme.textMuted;
  return categoryColors[category] ?? dashboardTheme.accent;
}
