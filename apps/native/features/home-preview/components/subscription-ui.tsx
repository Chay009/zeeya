import { Text } from "react-native";

import type { PreviewSub } from "../data";
import { hp } from "../theme";

export const previewCircleButtonStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: hp.border,
  backgroundColor: "rgba(255,255,255,0.7)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

export const previewEyebrowStyle = {
  fontSize: 10,
  fontWeight: "700" as const,
  letterSpacing: 1.8,
  color: hp.muted,
};

export const previewScreenTitleStyle = {
  marginTop: 4,
  fontSize: 22,
  fontWeight: "800" as const,
  letterSpacing: -1.3,
  color: hp.ink,
};

const typePalette: Record<PreviewSub["type"], { backgroundColor: string; color: string }> = {
  autopay: { backgroundColor: hp.chipBg, color: hp.emeraldDeep },
  recurring: { backgroundColor: "#eee4fb", color: "#8e61bf" },
  manual: { backgroundColor: "#fff7e6", color: "#b1843d" },
};

export function SubscriptionTypeBadge({ subscription }: { subscription: PreviewSub }) {
  const palette = typePalette[subscription.type];
  return (
    <Text
      style={{
        borderRadius: 999,
        backgroundColor: palette.backgroundColor,
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontSize: 9,
        fontWeight: "700",
        color: palette.color,
      }}
    >
      {subscription.typeLabel}
    </Text>
  );
}

export function SubscriptionStatusBadge({
  subscription,
  contained = false,
}: {
  subscription: PreviewSub;
  contained?: boolean;
}) {
  const active = subscription.status === "Active";
  return (
    <Text
      style={{
        borderRadius: 999,
        backgroundColor: contained ? (active ? "#f1f5ef" : "#eef4ef") : "transparent",
        paddingHorizontal: contained ? 8 : 0,
        paddingVertical: contained ? 3 : 0,
        fontSize: contained ? 9 : 11,
        fontWeight: "700",
        color: active ? hp.emeraldDeep : "#8a8378",
      }}
    >
      ● {subscription.status}
    </Text>
  );
}

export function ReactivatedBadge() {
  return (
    <Text
      style={{
        borderRadius: 999,
        backgroundColor: "#eee4fb",
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontSize: 9,
        fontWeight: "700",
        color: "#8e61bf",
      }}
    >
      Reactivated
    </Text>
  );
}
