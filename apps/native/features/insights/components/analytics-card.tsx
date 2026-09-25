import type { ReactNode } from "react";
import { Surface } from "heroui-native";
import { View } from "react-native";

export function AnalyticsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface asChild className={`overflow-hidden rounded-card bg-card p-5 ${className}`}>
      <View>{children}</View>
    </Surface>
  );
}
