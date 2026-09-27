import { memo, Suspense, use, useState } from "react";
import { Image, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { markLogoDomainFailed } from "../../../lib/logo-dev";

// img.logo.dev/{domain}?token=...&... — pull the domain segment back out
// so a failed fetch can be negative-cached (see lib/logo-dev.ts) instead
// of being re-attempted on every re-render or for every other transaction
// from the same merchant.
function logoDevDomain(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.hostname !== "img.logo.dev") return null;
    const domain = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return domain || null;
  } catch {
    return null;
  }
}

// cdn.simpleicons.org (every curated brand/bank entry in
// features/home-preview/data.ts's knownBrandStyles/knownBankStyles) serves
// SVG with no raster option, and React Native's `Image` can't decode
// image/svg+xml on either platform — so those are fetched as XML and drawn
// with react-native-svg.
const SVG_ONLY_HOSTS = ["cdn.simpleicons.org"];

function isKnownSvgSource(uri: string): boolean {
  return SVG_ONLY_HOSTS.some((host) => uri.includes(host));
}

// One fetch per logo URL for the whole session. SvgUri re-fetched and
// re-parsed the XML on the JS thread every time a row mounted — and a
// virtualized list remounts rows constantly while scrolling. The promise is
// cached (not just the result) so concurrent rows share one request; a
// failure resolves to null so it is never retried.
const svgXmlCache = new Map<string, Promise<string | null>>();

function loadSvgXml(uri: string): Promise<string | null> {
  let pending = svgXmlCache.get(uri);
  if (!pending) {
    pending = fetch(uri)
      .then((response) => (response.ok ? response.text() : null))
      .then((xml) => (xml && xml.includes("<svg") ? xml : null))
      .catch(() => null);
    svgXmlCache.set(uri, pending);
  }
  return pending;
}

// Suspends (showing nothing — the letter tile underneath stays) until the
// XML is cached, then renders synchronously on every later mount.
function RemoteSvg({ uri, size }: { uri: string; size: number }) {
  const xml = use(loadSvgXml(uri));
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} style={{ position: "absolute" }} />;
}

// Letter tile with a remote brand mark layered on top; if the image fails
// (offline, blocked CDN, malformed SVG), it drops out and the letter
// remains — same idea as the prototype's `onerror="this.remove()"`.
export const BrandLogo = memo(function BrandLogo({
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
  const onImageError = () => {
    if (img) {
      const domain = logoDevDomain(img);
      if (domain) markLogoDomainFailed(domain);
    }
    setFailed(true);
  };
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
      {img && isKnownSvgSource(img) ? (
        <Suspense fallback={null}>
          <RemoteSvg uri={img} size={iconSize} />
        </Suspense>
      ) : null}
      {!failed && img && !isKnownSvgSource(img) && (
        <Image
          source={{ uri: img, cache: "force-cache" }}
          onError={onImageError}
          style={{ position: "absolute", width: iconSize, height: iconSize }}
          resizeMode="contain"
        />
      )}
    </View>
  );
});
