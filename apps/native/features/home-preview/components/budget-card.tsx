import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Circle, Svg } from "react-native-svg";

import { hp } from "../theme";

const SIZE = 104;
const R = 44;
const CIRC = 2 * Math.PI * R;

export function BudgetCard({
  monthLabel,
  spent,
  limit,
  usedPercent,
  remaining,
}: {
  monthLabel: string;
  spent: string;
  limit: string | null;
  usedPercent: number | null;
  remaining: string | null;
}) {
  const hasBudget = limit !== null && usedPercent !== null;

  return (
    <View
      style={{
        marginTop: 16,
        borderRadius: 27,
        borderWidth: 1,
        borderColor: hp.border,
        backgroundColor: "rgba(255,255,255,0.7)",
        padding: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 20,
      }}
    >
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg
          viewBox="0 0 104 104"
          style={{ width: "100%", height: "100%", transform: [{ rotate: "-90deg" }] }}
        >
          <Circle cx="52" cy="52" r={R} fill="none" stroke={hp.track} strokeWidth="9" />
          <Circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke={hp.emerald}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${hasBudget ? (CIRC * usedPercent) / 100 : 0} ${CIRC}`}
          />
        </Svg>
        <View
          style={{
            ...StyleSheet.absoluteFill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: hp.ink }}>
            {hasBudget ? `${usedPercent}%` : "—"}
          </Text>
          <Text style={{ fontSize: 9, fontWeight: "700", letterSpacing: 1.2, color: hp.mutedSoft }}>
            USED
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.6, color: hp.muted }}>
          {monthLabel.toUpperCase()} BUDGET
        </Text>
        {limit ? (
          <Text
            style={{
              marginTop: 4,
              fontSize: 21,
              fontWeight: "800",
              letterSpacing: -1.25,
              color: hp.ink,
            }}
          >
            {spent}{" "}
            <Text style={{ fontSize: 14, fontWeight: "700", color: hp.mutedSoft }}>of {limit}</Text>
          </Text>
        ) : (
          <Text
            style={{
              marginTop: 4,
              fontSize: 19,
              fontWeight: "800",
              color: hp.ink,
            }}
          >
            No budget set
          </Text>
        )}
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons
            name={hasBudget ? "trending-up" : "information-circle-outline"}
            size={14}
            color={hp.emeraldDeep}
          />
          <Text style={{ fontSize: 12, fontWeight: "700", color: hp.emeraldDeep }}>
            {remaining ?? "Set a limit to track progress"}
          </Text>
        </View>
      </View>
    </View>
  );
}
