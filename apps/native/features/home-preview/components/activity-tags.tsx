import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";

import type { ActivityPill } from "../data";

export const ACTIVITY_TAG_CLASS: Record<
  ActivityPill["tone"],
  { chip: string; label: string }
> = {
  recurring: { chip: "bg-recurring-bg", label: "text-recurring-ink" },
  type: { chip: "bg-chip-bg", label: "text-emerald-deep" },
  subcategory: { chip: "bg-accent-soft", label: "text-accent-deep" },
  mandate: { chip: "bg-manual-bg", label: "text-manual-ink" },
  card: { chip: "bg-chip-bg", label: "text-ink-soft" },
  bank: { chip: "bg-surface-sage", label: "text-ink-soft" },
};

export function ActivityTag({
  label,
  tone,
}: {
  label: string;
  tone: ActivityPill["tone"];
}) {
  const style = ACTIVITY_TAG_CLASS[tone];
  return (
    <View className={`shrink rounded-pill px-[7px] py-[3px] ${style.chip}`}>
      <Text className={`text-[9px] font-extrabold ${style.label}`}>{label}</Text>
    </View>
  );
}

export function ActivityTagRow({
  tags,
}: {
  tags: { key: string; label: string; tone: ActivityPill["tone"] }[];
}) {
  if (tags.length === 0) return null;

  return (
    <View className="mt-1 flex-row flex-wrap gap-1.5">
      {tags.map((tag) => (
        <ActivityTag key={tag.key} label={tag.label} tone={tag.tone} />
      ))}
    </View>
  );
}
