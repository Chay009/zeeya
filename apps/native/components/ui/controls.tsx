import { Chip, Select, Tabs } from "heroui-native";
import { View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";

import { duration, tick } from "./motion";
import { useThemeColors } from "./theme";

// ── Segmented control ────────────────────────────────────────────────────
// iOS segmented control on HeroUI Tabs: grey track, white thumb that slides.
// Selection is never lime — lime is reserved for the brand, not for chrome.

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className = "",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next !== value) tick();
        onChange(next as T);
      }}
      className={className}
    >
      <Tabs.List className="w-full self-stretch rounded-[11px] bg-fill p-[3px]">
        <Tabs.Indicator className="rounded-[9px] bg-segment shadow-sm" />
        {options.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            className={`flex-1 ${size === "sm" ? "min-h-8 py-1" : "min-h-9 py-1.5"}`}
          >
            <Text
              numberOfLines={1}
              className={`${size === "sm" ? "text-meta" : "text-caption"} font-semibold ${
                option.value === value ? "text-ink" : "text-muted"
              }`}
            >
              {option.label}
            </Text>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

// ── Select pill ──────────────────────────────────────────────────────────
// A compact dropdown trigger for header filters (period, currency, account).

export function SelectPill<T extends string>({
  value,
  options,
  onChange,
  icon,
  accessibilityLabel,
  tone = "card",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  icon?: AppIconName;
  accessibilityLabel: string;
  tone?: "card" | "fill";
}) {
  const colors = useThemeColors();
  const selected = options.find((option) => option.value === value) ?? options[0];
  if (!selected) return null;

  return (
    <Select
      value={selected}
      onValueChange={(next) => {
        if (!Array.isArray(next) && next?.value) {
          tick();
          onChange(next.value as T);
        }
      }}
      presentation="popover"
    >
      <Select.Trigger
        variant="unstyled"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={`h-9 flex-row items-center gap-1.5 rounded-pill px-3.5 ${
          tone === "card" ? "bg-card" : "bg-fill"
        }`}
      >
        {icon ? <AppIcon name={icon} size={15} color={colors.muted} /> : null}
        <Text numberOfLines={1} className="max-w-[180px] text-caption font-semibold text-ink">
          {selected.label}
        </Text>
        <AppIcon name="chevron-down" size={14} color={colors.muted} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="popover" className="min-w-[200px] rounded-tile">
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value} label={option.label}>
              <Select.ItemLabel numberOfLines={1} className="min-w-0 flex-1" />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

// ── Delta chip ───────────────────────────────────────────────────────────
// "↓ 12% vs Aug". `goodWhen` says which direction is good news: spending
// going down is green, income going down is red.

export function DeltaChip({
  percent,
  suffix,
  goodWhen,
  size = "sm",
}: {
  percent: number | null;
  suffix?: string;
  goodWhen: "up" | "down";
  size?: "sm" | "md";
}) {
  const colors = useThemeColors();
  if (percent === null || !Number.isFinite(percent)) return null;
  const rounded = Math.round(Math.abs(percent));
  const flat = rounded === 0;
  const up = percent > 0;
  const good = flat ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
  const color = good === null ? "default" : good ? "success" : "danger";
  const ink = good === null ? colors.muted : good ? colors.positive : colors.negative;

  return (
    <Animated.View entering={FadeIn.duration(duration.base).delay(160)}>
    <Chip variant="soft" color={color} size={size} className="gap-1 rounded-pill px-2">
      {!flat ? <AppIcon name={up ? "trend-up" : "trend-down"} size={13} color={ink} /> : null}
      <Text className="text-meta font-semibold" style={{ color: ink }}>
        {flat ? "Same" : `${rounded}%`}
        {suffix ? ` ${suffix}` : ""}
      </Text>
    </Chip>
    </Animated.View>
  );
}

// ── Small visual atoms ───────────────────────────────────────────────────

export function IconTile({
  icon,
  color,
  background,
  size = 40,
}: {
  icon: AppIconName;
  color: string;
  background: string;
  size?: number;
}) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: background, borderCurve: "continuous" }}
    >
      <AppIcon name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

export function ProgressBar({
  value,
  color,
  height = 6,
  className = "",
}: {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value));

  // Declarative: fills from empty once on mount (keyframes), then the width
  // transitions whenever the value changes — no shared value, no effect.
  return (
    <View className={`overflow-hidden rounded-pill bg-fill ${className}`} style={{ height }}>
      <Animated.View
        className="h-full rounded-pill"
        style={{
          width: `${pct * 100}%`,
          minWidth: pct > 0 ? height : 0,
          backgroundColor: color ?? colors.ink,
          transformOrigin: "left",
          animationName: reducedMotion ? "none" : FILL_IN,
          animationDuration: 600,
          animationDelay: 120,
          animationTimingFunction: "ease-out",
          animationFillMode: "backwards",
          transitionProperty: "width",
          transitionDuration: reducedMotion ? 0 : 420,
          transitionTimingFunction: "ease-out",
        }}
      />
    </View>
  );
}

const FILL_IN = {
  from: { transform: [{ scaleX: 0 }] },
  to: { transform: [{ scaleX: 1 }] },
};
