import {
  GlassView,
  isGlassEffectAPIAvailable,
  type GlassEffectStyleConfig,
  type GlassStyle,
} from "expo-glass-effect";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { useNativeUiTheme } from "./theme";

export type GlassSurfaceProps = ViewProps & {
  effectStyle?: GlassStyle | GlassEffectStyleConfig;
  tintColor?: string;
  interactive?: boolean;
  elevated?: boolean;
};

function supportsNativeGlass(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/**
 * Real Liquid Glass only when the OS has it. Everywhere else this is a
 * solid card — a 36% white overlay over decorative blobs is not glass,
 * it is a dirty window.
 */
export function GlassSurface({
  children,
  effectStyle = "regular",
  tintColor,
  interactive = false,
  elevated = false,
  style,
  ...props
}: GlassSurfaceProps) {
  const { isDark } = useNativeUiTheme();

  if (supportsNativeGlass()) {
    return (
      <GlassView
        {...props}
        glassEffectStyle={effectStyle}
        colorScheme={isDark ? "dark" : "light"}
        tintColor={tintColor}
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      {...props}
      style={[
        {
          overflow: "hidden",
          backgroundColor: isDark ? "#1c1c22" : "#ffffff",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "#e6e6eb",
        },
        elevated && styles.elevation,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  elevation: {
    shadowColor: "#101014",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
});
