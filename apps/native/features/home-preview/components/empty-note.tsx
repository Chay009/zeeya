import { Spinner } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

export function EmptyNote({
  icon,
  title,
  body,
}: {
  icon: AppIconName;
  title: string;
  body: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="items-center px-3 py-6">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <AppIcon name={icon} size={26} color={colors.accent} />
      </View>
      <Text className="mt-3 text-center text-subtitle font-semibold text-ink">{title}</Text>
      <Text className="mt-1.5 max-w-[260px] text-center text-caption leading-[18px] text-muted">
        {body}
      </Text>
    </View>
  );
}

// A still-syncing variant of EmptyNote's layout — the icon circle is
// replaced with a circular Spinner (already used for the same "still
// working" state in home-permission-card.tsx) instead of a linear progress
// bar. This codebase already treats a fabricated percentage/endpoint as
// more misleading than none at all (see that file's own comment on why it
// shows scanned/imported counts, not a percentage) — an indeterminate
// circular spinner matches that same honesty rule, where a linear bar would
// visually imply a known endpoint this data doesn't have.
export function SyncingNote({ title, body }: { title: string; body: string }) {
  return (
    <View className="items-center px-3 py-6">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Spinner size="md" />
      </View>
      <Text className="mt-3 text-center text-subtitle font-semibold text-ink">{title}</Text>
      <Text className="mt-1.5 max-w-[260px] text-center text-caption leading-[18px] text-muted">
        {body}
      </Text>
    </View>
  );
}
