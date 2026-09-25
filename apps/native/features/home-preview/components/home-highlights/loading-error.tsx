import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import { hp } from "../../theme";
import { GhostLine } from "./shared";

export function LoadingHighlights() {
  return (
    <View className="mt-4 rounded-card bg-card px-5 py-5">
      <View className="gap-3">
        <GhostLine width={88} height={12} />
        <GhostLine width={160} height={28} />
        <GhostLine width={220} height={10} />
      </View>
    </View>
  );
}

export function ErrorHighlights({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <View className="mt-4 rounded-card bg-card p-[18px]">
      <View className="flex-row items-start gap-3">
        <AppIcon name="alert" size={20} color={hp.coral} />
        <View className="min-w-0 flex-1">
          <Text className="text-subtitle font-extrabold text-ink">
            Couldn&apos;t load today&apos;s highlights
          </Text>
          <Text className="mt-1 text-caption leading-[18px] text-muted" numberOfLines={3}>
            {error ?? "Try again after the inbox projection is available."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading Home highlights"
            onPress={onRetry}
            className="min-h-11 justify-center self-start"
          >
            <Text className="text-caption font-extrabold text-accent-deep">Retry</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
