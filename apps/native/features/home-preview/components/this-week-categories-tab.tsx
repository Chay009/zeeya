import { Circle, Svg } from "react-native-svg";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";

import type { HomePreviewData } from "../data";
import { EmptyNote } from "./empty-note";
import { hp } from "../theme";

const RING_SIZE = 52;
const RING_RADIUS = 20;
const RING_STROKE = 5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function categoryIcon(label: string): AppIconName {
  const value = label.toLowerCase();
  if (/food|dining|restaurant|grocery/.test(value)) return "food";
  if (/shop|retail|grocer/.test(value)) return "bag";
  if (/travel|transport|flight|fuel|commute/.test(value)) return "airplane";
  if (/transfer|income|salary/.test(value)) return "swap";
  if (/bill|utilit|rent|house|home/.test(value)) return "receipt";
  if (/health|medical|pharmacy/.test(value)) return "health";
  if (/education|school/.test(value)) return "school";
  return "pie-chart";
}

function translucent(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function CategoryRing({ pct, color }: { pct: number; color: string }) {
  const visiblePct = Math.max(0, Math.min(100, pct));
  const dashOffset = RING_CIRCUMFERENCE * (1 - visiblePct / 100);

  return (
    <View className="h-[52px] w-[52px] items-center justify-center">
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="transparent"
          stroke={hp.track}
          strokeWidth={RING_STROKE}
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="transparent"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-[11px] font-extrabold text-ink">{visiblePct}%</Text>
      </View>
    </View>
  );
}

export function ThisWeekCategoriesTab({ data }: { data: HomePreviewData["cashflow"] }) {
  if (data.categories.length === 0) {
    return (
      <EmptyNote
        icon="pie-chart"
        title="No categories yet"
        body="When you spend this month, each category gets a ring showing where the money went."
      />
    );
  }

  return (
    <View>
      <Text className="text-caption text-sage-soft">Where the money went this month</Text>
      <View className="mt-3 gap-1">
        {data.categories.map((cat) => (
          <View key={cat.label} className="flex-row items-center gap-3 py-2">
            <View
              className="h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
              style={{ backgroundColor: translucent(cat.color, 0.14) }}
            >
              <AppIcon name={categoryIcon(cat.label)} size={21} color={cat.color} />
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-subtitle font-extrabold text-ink">
                {cat.label}
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
                {cat.amount} · {cat.pct}% of spending
              </Text>
            </View>
            <CategoryRing pct={cat.pct} color={cat.color} />
          </View>
        ))}
      </View>
    </View>
  );
}
