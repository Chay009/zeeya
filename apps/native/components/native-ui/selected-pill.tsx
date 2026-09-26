import type { ReactNode } from "react";
import { Pressable, type PressableProps, View } from "react-native";

import { AppText as Text } from "@/components/app-text";

type SelectedPillVariant = "lime" | "ink";

const SELECTED_CLASS: Record<SelectedPillVariant, { shell: string; label: string; muted: string }> = {
  lime: {
    shell: "bg-accent",
    label: "text-on-accent",
    muted: "text-on-accent opacity-70",
  },
  ink: {
    shell: "bg-ink",
    label: "text-on-ink",
    muted: "text-faint",
  },
};

export function SelectedPill({
  selected,
  variant = "lime",
  onPress,
  label,
  detail,
  className = "",
  accessibilityLabel,
  disabled,
}: {
  selected: boolean;
  variant?: SelectedPillVariant;
  onPress?: PressableProps["onPress"];
  label: string;
  detail?: string;
  className?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const tone = SELECTED_CLASS[variant];
  const shellClass = selected ? tone.shell : "border border-border bg-fill";
  const labelClass = selected ? tone.label : "text-ink-soft";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-1.5 rounded-pill px-3.5 py-2 ${shellClass} ${className}`}
    >
      <Text className={`text-meta font-extrabold ${labelClass}`}>{label}</Text>
      {detail ? (
        <Text className={`text-meta ${selected ? tone.muted : "text-muted"}`}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

export function LimeActionPill({
  onPress,
  children,
  disabled,
  className = "",
  accessibilityLabel,
}: {
  onPress?: PressableProps["onPress"];
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-1 rounded-pill bg-accent py-1.5 pl-3 pr-2.5 ${disabled ? "opacity-45" : ""} ${className}`}
    >
      {children}
    </Pressable>
  );
}

export function CurrencyChipGroup({
  currencies,
  selected,
  onSelect,
}: {
  currencies: string[];
  selected: string;
  onSelect: (currency: string) => void;
}) {
  if (currencies.length === 0) return null;

  return (
    <View className="flex-row rounded-pill bg-fill p-0.5">
      {currencies.map((currencyCode) => {
        const isSelected = currencyCode === selected;
        return (
          <Pressable
            key={currencyCode}
            onPress={() => onSelect(currencyCode)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`rounded-pill px-2.5 py-1 ${isSelected ? "bg-accent" : ""}`}
          >
            <Text className={`text-label font-extrabold ${isSelected ? "text-on-accent" : "text-muted"}`}>
              {currencyCode}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
