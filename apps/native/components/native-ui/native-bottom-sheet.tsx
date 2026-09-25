import { Dialog } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

export type NativeBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  snapPoints?: Array<string | number>;
};

// Web has no Gorhom sheet surface. Dialog keeps the same controlled seam and
// keyboard/accessibility behavior while native builds use the real sheet.
export function NativeBottomSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
}: NativeBottomSheetProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>{title}</Dialog.Title>
          {description && <Dialog.Description>{description}</Dialog.Description>}
          <View style={{ marginTop: 16 }}>{children}</View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
