// Direct client-side call to logo.dev's name-based lookup
// (img.logo.dev/name/{name}) — a testing-only prototype for issue #15's
// vendor/merchant logo work, using an EXPO_PUBLIC_ token for now instead
// of the Worker+R2-cached proxy that issue describes as the real plan.
// A client-side token here is spent per app install, not once globally
// like the proxy would be, and ships inside the public app bundle
// (EXPO_PUBLIC_ vars always do) — acceptable for validating the visual
// result, not for production traffic volume.
//
// Read directly from process.env (Metro inlines EXPO_PUBLIC_* at bundle
// time — the standard Expo pattern), not via @zeeya/env/native: that
// module's createEnv() validates every declared client var together and
// throws if any of them is missing, including EXPO_PUBLIC_SERVER_URL
// (required, unrelated to this file) — which isn't set in the Vitest
// environment this module's caller (features/home-preview/data.ts) is
// tested under. Going through it here would break every test that
// imports data.ts merely by adding an unrelated optional var.
export function logoUrlFor(name: string): string | null {
  const token = process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
  const trimmed = name.trim();
  if (!token || !trimmed) return null;

  // "png", not "webp" — static WebP decoding on Android has historically
  // required the Fresco webpsupport artifact to be present in the native
  // build, which isn't guaranteed here (no committed android/ directory —
  // this is a managed CNG workflow, prebuilt fresh each build). PNG has no
  // such dependency on either platform.
  const params = new URLSearchParams({ token, format: "png", retina: "true" });
  // The bare img.logo.dev/{name} path (no "/name/" segment) only resolves
  // for names that happen to already look like a domain/slug — confirmed
  // directly: "HDFC" rendered, "State Bank of India" did not, and adding
  // "/name/" fixed the latter. img.logo.dev/{domain} (e.g. sbi.co.in) also
  // works, but this app only has free-text bank/merchant names, not
  // domains, so the "/name/" search endpoint is the correct one here.
  const url = `https://img.logo.dev/name/${encodeURIComponent(trimmed)}?${params.toString()}`;
  // TEMPORARY diagnostic — only some names render on-device despite the
  // /name/ endpoint working for those same strings when tested directly
  // in a browser, and this can't be reproduced from a sandbox with no
  // device. Logging the exact input string and resulting URL side by
  // side is what lets that be compared for real instead of guessed at.
  // Remove once the on-device cause is confirmed.
  console.log(`[logo-dev] name=${JSON.stringify(trimmed)} url=${url}`);
  return url;
}
