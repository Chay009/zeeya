// Client-side call to logo.dev's exact domain endpoint
// (img.logo.dev/{domain}) — issue #15's vendor/merchant logo work.
//
// This intentionally does NOT call logo.dev's fuzzy /name/ search: that
// endpoint takes a free-text guess and returns *some* logo for it with no
// verification, which risks showing an unrelated real brand's mark next to
// a transaction it has nothing to do with. A verified consultation on this
// architecture (see issue #15) confirmed that only a known, curated
// name→domain mapping should ever resolve to a real logo; everything else
// must fall back to the deterministic letter/category tile until a
// server-side candidate-search + verification step exists to grow that
// mapping safely. So this module only ever takes a domain the caller
// already knows is correct (data.ts's knownBrandStyles/knownBankStyles),
// never a raw merchant/vendor name.
//
// Read directly from process.env (Metro inlines EXPO_PUBLIC_* at bundle
// time — the standard Expo pattern), not via @zeeya/env/native: that
// module's createEnv() validates every declared client var together and
// throws if any of them is missing, including EXPO_PUBLIC_SERVER_URL
// (required, unrelated to this file) — which isn't set in the Vitest
// environment this module's caller (features/home-preview/data.ts) is
// tested under. Going through it here would break every test that
// imports data.ts merely by adding an unrelated optional var.
//
// A publishable logo.dev token is meant to ship client-side (it's rate-
// and domain-scoped on logo.dev's end, not a secret) — this is its
// intended use, not a stand-in for a server proxy.

// Domains a prior request already 404'd for, this process lifetime — skips
// building (and BrandLogo re-fetching) a URL already known to fail instead
// of re-attempting the same dead request on every render/message.
const failedDomains = new Set<string>();

export function logoUrlForDomain(domain: string): string | null {
  const token = process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
  const trimmed = domain.trim();
  if (!token || !trimmed || failedDomains.has(trimmed)) return null;

  // "png", not "webp" — static WebP decoding on Android has historically
  // required the Fresco webpsupport artifact to be present in the native
  // build, which isn't guaranteed here (no committed android/ directory —
  // this is a managed CNG workflow, prebuilt fresh each build). PNG has no
  // such dependency on either platform.
  const params = new URLSearchParams({ token, format: "png", retina: "true" });
  return `https://img.logo.dev/${encodeURIComponent(trimmed)}?${params.toString()}`;
}

export function markLogoDomainFailed(domain: string): void {
  failedDomains.add(domain.trim());
}

// Test-only: negative caching persists for the module's lifetime, which
// would otherwise leak between unrelated test cases run in the same file.
export function resetLogoDomainFailures(): void {
  failedDomains.clear();
}
