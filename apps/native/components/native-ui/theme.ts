import { useAppTheme } from "@/contexts/app-theme-context";

export type NativeUiColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfacePressed: string;
  border: string;
  ink: string;
  muted: string;
  onSurface: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  scrim: string;
};

// Native chrome primitives (glass, tab bar, sheets). Lime fill + near-black
// onAccent text — see features/home-preview/theme.ts.
export const nativeUiPalette: Record<"light" | "dark", NativeUiColors> = {
  light: {
    background: "#f4f4f6",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfacePressed: "#f5f5f9",
    border: "#e6e6eb",
    ink: "#101014",
    muted: "#6e6e7a",
    onSurface: "#ffffff",
    accent: "#c9ef69",
    accentPressed: "#b5d932",
    onAccent: "#101014",
    scrim: "rgba(16,16,20,0.28)",
  },
  dark: {
    background: "#111116",
    surface: "rgba(34,34,43,0.9)",
    surfaceRaised: "rgba(42,42,52,0.98)",
    surfacePressed: "rgba(52,52,64,0.98)",
    border: "rgba(255,255,255,0.12)",
    ink: "#f7f7fa",
    muted: "#b4b4c1",
    onSurface: "#111116",
    accent: "#c9ef69",
    accentPressed: "#b5d932",
    onAccent: "#101014",
    scrim: "rgba(0,0,0,0.48)",
  },
};

export function useNativeUiTheme(): { colors: NativeUiColors; isDark: boolean } {
  const { isDark } = useAppTheme();
  return { colors: nativeUiPalette[isDark ? "dark" : "light"], isDark };
}

export function useNativeUiColors(): NativeUiColors {
  return useNativeUiTheme().colors;
}
