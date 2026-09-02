// Direct client-side call to logo.dev's name-based lookup
// (img.logo.dev/{name}) — a testing-only prototype for issue #15's
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

  const params = new URLSearchParams({ token, format: "webp", retina: "true" });
  return `https://img.logo.dev/${encodeURIComponent(trimmed)}?${params.toString()}`;
}
