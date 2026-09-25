import { Image, View } from "react-native";

type BankIconPosition = {
  right?: number;
  left?: number;
  top?: number;
  bottom?: number;
  size: number;
  opacity: number;
  rotate: `${number}deg`;
};

const BANK_ICON_POSITIONS: readonly BankIconPosition[] = [
  { right: -24, top: -24, size: 132, opacity: 0.1, rotate: "-12deg" },
  { right: 58, top: 82, size: 72, opacity: 0.08, rotate: "9deg" },
  { right: -18, bottom: -54, size: 142, opacity: 0.08, rotate: "14deg" },
  { left: 120, bottom: -32, size: 84, opacity: 0.06, rotate: "-8deg" },
] as const;

// A faint scatter of the bank's own mark, used behind the evidence rows so
// an otherwise plain row still reads as belonging to that bank. Not used on
// AccountCard: there the balance is the subject, and the pattern only
// competed with it.
export function BankIconPattern({ uri }: { uri?: string }) {
  if (!uri) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {BANK_ICON_POSITIONS.map((position, index) => (
        <Image
          key={index}
          source={{ uri }}
          resizeMode="contain"
          style={{
            position: "absolute",
            ...(position.right !== undefined ? { right: position.right } : {}),
            ...(position.left !== undefined ? { left: position.left } : {}),
            ...(position.top !== undefined ? { top: position.top } : {}),
            ...(position.bottom !== undefined ? { bottom: position.bottom } : {}),
            width: position.size,
            height: position.size,
            opacity: position.opacity,
            transform: [{ rotate: position.rotate }],
          }}
        />
      ))}
    </View>
  );
}
