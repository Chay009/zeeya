import { cn } from "heroui-native";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { GlassButton } from "@/components/native-ui/glass-button";
import { GlassSurface } from "@/components/native-ui/glass-surface";
import { useThemeColors } from "@/components/ui/theme";

export function InsightsPanel({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassSurface
      elevated
      effectStyle="regular"
      className={cn("rounded-hero p-5", className)}
      style={style}
    >
      {children}
    </GlassSurface>
  );
}

export function InsightsIconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: AppIconName;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GlassButton
      iconOnly
      accessibilityLabel={label}
      onPress={onPress}
      icon={<AppIcon name={icon} size={20} color={colors.ink} />}
    />
  );
}

export function InsightsNotice({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <GlassSurface effectStyle="clear" className="rounded-card p-4">
      <View className="flex-row items-start gap-2.5">
        <AppIcon name="info" size={18} color={colors.accent} />
        <Text className="flex-1 text-[13px] leading-[18px] text-ink-soft">{children}</Text>
      </View>
    </GlassSurface>
  );
}

export function InsightsEmptyState({
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
    <View className="items-center px-2 py-5">
      <View className="mb-2.5 h-9 w-9 items-center justify-center rounded-full bg-fill">
        <AppIcon name={icon} size={18} color={colors.muted} />
      </View>
      <Text className="text-subtitle font-bold text-ink">{title}</Text>
      <Text className="mt-1.5 text-center text-[13px] leading-[18px] text-muted">{body}</Text>
    </View>
  );
}

export function InsightsOverviewError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <InsightsPanel className="mt-4">
      <Text className="text-base font-bold text-ink">Couldn&apos;t load analytics</Text>
      <Text className="mt-1.5 text-[13px] leading-[18px] text-muted" numberOfLines={3}>
        {error ?? "Try again after the projection is available."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading the captured overview"
        onPress={onRetry}
        className="min-h-11 justify-center self-start"
      >
        <Text className="text-[13px] font-bold text-accent">Retry</Text>
      </Pressable>
    </InsightsPanel>
  );
}
