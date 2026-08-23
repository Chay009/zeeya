import { useState } from "react";
import { Image, Text, View } from "react-native";

// Letter tile with a remote brand mark layered on top; if the image fails
// (offline, blocked CDN), it drops out and the letter remains — same idea as
// the prototype's `onerror="this.remove()"`.
export function BrandLogo({
  letter,
  tile,
  ink,
  img,
  size = 40,
  radius = 14,
  iconRatio = 0.62,
}: {
  letter: string;
  tile: string;
  ink: string;
  img: string;
  size?: number;
  radius?: number;
  iconRatio?: number;
}) {
  const [failed, setFailed] = useState(false);
  const iconSize = Math.round(size * iconRatio);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: tile,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: ink, fontWeight: "800", fontSize: Math.round(size * 0.36) }}>
        {letter}
      </Text>
      {!failed && (
        <Image
          source={{ uri: img }}
          onError={() => setFailed(true)}
          style={{ position: "absolute", width: iconSize, height: iconSize }}
          resizeMode="contain"
        />
      )}
    </View>
  );
}
