import type { ReactNode } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

import { ART_SOURCES } from "./art-sources";

// The illustration layer (see assets/art/CATALOG.md): one flat 2.5D art
// piece per category and per section/state moment. Icons stay for
// navigation and controls only.

const SOURCES: Record<string, number> = ART_SOURCES;

export function hasArt(name: string): boolean {
  return name in SOURCES;
}

/**
 * Draws one catalog piece, square, at `size`. Pieces are generated in
 * batches, so a name may not exist yet — `fallback` renders instead (the
 * icon it replaces), and nothing breaks.
 */
export function Art({
  name,
  size,
  fallback = null,
  style,
  accessibilityLabel,
}: {
  name: string;
  size: number;
  fallback?: ReactNode;
  style?: StyleProp<ImageStyle>;
  /** Decorative by default; pass a label when the art carries meaning. */
  accessibilityLabel?: string;
}) {
  const source = SOURCES[name];
  if (source === undefined) return <>{fallback}</>;
  return (
    <Image
      source={source}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      importantForAccessibility={accessibilityLabel === undefined ? "no-hide-descendants" : "auto"}
    />
  );
}
