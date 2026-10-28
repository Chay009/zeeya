import { memo, Suspense, use, useState } from "react";
import { Image, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { authClient } from "@/lib/auth-client";
import { logoDomainFromUrl, markLogoDomainFailed } from "../../../lib/logo-dev";

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
  const { data: session } = authClient.useSession();
  const iconSize = Math.round(size * iconRatio);
  // Our /logos endpoint is for signed-in users: send the session cookie
  // (Better Auth's Expo pattern); signed out, the letter tile stays.
  const isOwnLogo = img ? logoDomainFromUrl(img) !== null : false;
  const cookie = isOwnLogo && session ? authClient.getCookie() : "";
  const showImage = !failed && img && !isKnownSvgSource(img) && (!isOwnLogo || cookie);
  const onImageError = () => {
    if (img) {
      // Negative-cache a failed logo so it isn't re-fetched on every render
      // or for every other transaction from the same merchant.
      const domain = logoDomainFromUrl(img);
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
      {showImage && (
        <Image
          source={{
            uri: img,
            cache: "force-cache",
            ...(cookie ? { headers: { Cookie: cookie } } : {}),
          }}
          onError={onImageError}
          style={{ position: "absolute", width: iconSize, height: iconSize }}
          resizeMode="contain"
        />
      )}
    </View>
  );
});
