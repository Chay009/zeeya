import { View } from "react-native";

import { Art } from "@/components/art/art";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { categoryArt, categoryIcon } from "@/features/insights/category-visual";

/**
 * A spending category's visual: its catalog art (assets/art) on one neutral
 * field — the same field for every category, so a list reads as one calm
 * column rather than a rainbow of tints. Until a category has art, its line
 * icon in ink. `color` is kept for call-site compatibility and no longer
 * tints the tile.
 */
export function CategoryTile({
  label,
  size = 40,
}: {
  label: string;
  /** @deprecated tiles are neutral; kept so existing callers compile. */
  color?: string;
  size?: number;
}) {
  const colors = useThemeColors();
  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        borderCurve: "continuous",
        backgroundColor: colors.fill,
      }}
    >
      <Art
        name={categoryArt(label)}
        size={Math.round(size * 0.86)}
        fallback={
          <AppIcon name={categoryIcon(label)} size={Math.round(size * 0.48)} color={colors.ink} />
        }
      />
    </View>
  );
}
