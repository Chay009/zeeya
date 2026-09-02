import { useState } from "react";
import { Image, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

// cdn.simpleicons.org (every curated brand/bank entry in
// features/home-preview/data.ts's knownBrandStyles/knownBankStyles) serves
// SVG with no raster option — confirmed no remote logo has ever rendered in
// this app despite the URLs themselves working fine in a browser (which
// rasterizes SVG natively): React Native's own `Image` has never supported
// decoding image/svg+xml at all, on either platform, so every one of these
// was silently failing onError and falling back to the letter tile the
// whole time. `react-native-svg`'s `SvgUri` (already a dependency, used
// elsewhere in this same feature) fetches and renders SVG XML directly, so
// it's used for this specific source instead of forcing raster decoding on
// a format that was never going to work.
const SVG_ONLY_HOSTS = ["cdn.simpleicons.org"];

function isKnownSvgSource(uri: string): boolean {
  return SVG_ONLY_HOSTS.some((host) => uri.includes(host));
}

// Letter tile with a remote brand mark layered on top; if the image fails
// (offline, blocked CDN, malformed SVG), it drops out and the letter
// remains — same idea as the prototype's `onerror="this.remove()"`.
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
  img?: string;
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
      {!failed && img && isKnownSvgSource(img) && (
        <SvgUri
          uri={img}
          onError={(e) => {
            // TEMPORARY diagnostic — see lib/logo-dev.ts's own note.
            console.log(`[BrandLogo] SvgUri failed for ${img}:`, e);
            setFailed(true);
          }}
          width={iconSize}
          height={iconSize}
          style={{ position: "absolute" }}
        />
      )}
      {!failed && img && !isKnownSvgSource(img) && (
        <Image
          source={{ uri: img }}
          onError={(e) => {
            // TEMPORARY diagnostic — see lib/logo-dev.ts's own note.
            console.log(`[BrandLogo] Image failed for ${img}:`, e.nativeEvent.error);
            setFailed(true);
          }}
          onLoad={() => console.log(`[BrandLogo] Image loaded OK for ${img}`)}
          style={{ position: "absolute", width: iconSize, height: iconSize }}
          resizeMode="contain"
        />
      )}
    </View>
  );
}
