import { type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";

import { GlassButton } from "./glass-button";
import { useNativeUiColors } from "./theme";

export type ScreenToolbarAction = {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
  disabled?: boolean;
};

export function ScreenToolbar({
  title,
  eyebrow,
  topInset = 0,
  onBack,
  backLabel = "Go back",
  actions = [],
  right,
  style,
}: {
  title: string;
  eyebrow?: string;
  topInset?: number;
  onBack?: () => void;
  backLabel?: string;
  actions?: ScreenToolbarAction[];
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useNativeUiColors();

  return (
    <View style={[{ paddingTop: Math.max(8, topInset), paddingHorizontal: 20 }, style]}>
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {onBack ? (
          <GlassButton
            iconOnly
            accessibilityLabel={backLabel}
            onPress={onBack}
            style={{ flexShrink: 0 }}
            icon={<AppIcon name="chevron-left" size={20} color={colors.ink} />}
          />
        ) : (
          <View style={{ width: 44, height: 44 }} />
        )}

        <View style={{ flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 4 }}>
          {eyebrow && (
            <AppText
              numberOfLines={1}
              style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: colors.muted }}
            >
              {eyebrow.toUpperCase()}
            </AppText>
          )}
          <AppText
            numberOfLines={1}
            style={{
              marginTop: eyebrow ? 2 : 0,
              fontSize: 18,
              fontWeight: "800",
              color: colors.ink,
            }}
          >
            {title}
          </AppText>
        </View>

        {right ?? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {actions.map((action) => (
              <GlassButton
                key={action.key}
                iconOnly
                disabled={action.disabled}
                accessibilityLabel={action.label}
                onPress={action.onPress}
                icon={<AppIcon name={action.icon} size={19} color={colors.ink} />}
              />
            ))}
            {actions.length === 0 && <View style={{ width: 44, height: 44 }} />}
          </View>
        )}
      </View>
    </View>
  );
}
