import { View } from "react-native";

import { Delayed, ErrorState, SkeletonBlock, SkeletonRows } from "@/components/ui/states";

export function LoadingHighlights() {
  return (
    <View className="mt-7">
      <Delayed minHeight={16}>
        <SkeletonBlock className="mb-3 ml-1 h-4 w-16" />
      </Delayed>
      <SkeletonRows count={3} />
    </View>
  );
}

export function ErrorHighlights({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <View className="mt-7 rounded-card bg-card">
      <ErrorState compact title="Couldn't load today" body={error} onRetry={onRetry} />
    </View>
  );
}
