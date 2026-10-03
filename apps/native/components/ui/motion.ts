import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { Easing, FadeIn, FadeOut, LinearTransition, cubicBezier } from "react-native-reanimated";

// Motion tokens. One feel across the app: quick, soft, never bouncy enough
// to draw attention to itself. Every animation here respects Reduce Motion
// (Reanimated's layout animations and useReducedMotion guards at call sites).

export const duration = {
  fast: 160,
  base: 240,
  slow: 420,
} as const;

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
/** The same curve for Reanimated's CSS animations and transitions. */
export const easeOutCss = cubicBezier(0.22, 1, 0.36, 1);

/**
 * A number settling into a new value: re-key the node on the formatted value
 * and play this, so a change rises and fades in (Money, HeroAmount). Under
 * Reduce Motion use VALUE_FADE — the change still reads, without movement.
 */
export const VALUE_IN = {
  from: { opacity: 0, transform: [{ translateY: 6 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
};
export const VALUE_FADE = { from: { opacity: 0 }, to: { opacity: 1 } };
export const VALUE_DURATION = 220;

/** Settling spring — values that grow into place (bars, progress). */
export const settle = { damping: 20, stiffness: 180, mass: 0.9 } as const;

/** Snappy spring — press feedback, selection pops. */
export const snappy = { damping: 16, stiffness: 320, mass: 0.6 } as const;

/** Rows entering a list after a filter change. */
export const rowEnter = FadeIn.duration(duration.base).easing(easeOut);
export const rowExit = FadeOut.duration(duration.fast);
/** Siblings sliding into their new place when rows appear/disappear. */
export const rowLayout = LinearTransition.duration(duration.base).easing(easeOut);

/** Light selection tick — segment changes, chip picks, bar taps. */
export function tick() {
  if (Platform.OS === "web" || process.env.NODE_ENV === "test") return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** A soft thud for meaningful confirmations (pull-to-refresh done, etc.). */
export function thud() {
  if (Platform.OS === "web" || process.env.NODE_ENV === "test") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
