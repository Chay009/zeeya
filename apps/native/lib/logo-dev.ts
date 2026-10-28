// Vendor/merchant logos (issue #15), served by our API's /logos endpoint
// (apps/server/src/logos.ts). The server fetches each domain once from
// logo.dev's exact domain endpoint with its own token, stores it in R2 and
// serves it from there, so no logo.dev token ships in the app.
//
// This intentionally only takes a domain the caller already knows is correct
// (data.ts's knownBrandStyles/knownBankStyles), never a raw merchant/vendor
// name: a free-text guess risks showing an unrelated real brand's mark next
// to a transaction it has nothing to do with. Everything else falls back to
// the deterministic letter/category tile.
//
// Read directly from process.env (Metro inlines EXPO_PUBLIC_* at bundle
// time — the standard Expo pattern), not via @zeeya/env/native: that
// module's createEnv() validates every declared client var together and
// throws if any is missing, which would break every test that imports
// features/home-preview/data.ts without a server URL configured.

// Domains whose logo failed to load, with when — skips building (and
// BrandLogo re-fetching) a URL that just failed on every render/message.
// The image error doesn't say why (offline, rate-limited, no logo), so a
// failure is retried after a while instead of for the whole session.
const failedDomains = new Map<string, number>();
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;

function logosBase(): string | null {
  const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL?.trim().replace(/\/+$/, "");
  return serverUrl ? `${serverUrl}/logos/` : null;
}

function recentlyFailed(domain: string): boolean {
  const failedAt = failedDomains.get(domain);
  return failedAt !== undefined && Date.now() - failedAt < RETRY_FAILED_AFTER_MS;
}

export function logoUrlForDomain(domain: string): string | null {
  const base = logosBase();
  const trimmed = domain.trim().toLowerCase();
  if (!base || !trimmed || recentlyFailed(trimmed)) return null;

  // PNG, not WebP: static WebP decoding on Android needs a native artifact
  // that this managed (CNG) build doesn't guarantee.
  return `${base}${encodeURIComponent(trimmed)}.png`;
}

/** The domain a logoUrlForDomain URL was built for, or null for any other URL. */
export function logoDomainFromUrl(uri: string): string | null {
  const base = logosBase();
  if (!base || !uri.startsWith(base) || !uri.endsWith(".png")) return null;
  try {
    const domain = decodeURIComponent(uri.slice(base.length, -".png".length));
    return domain || null;
  } catch {
    return null;
  }
}

export function markLogoDomainFailed(domain: string): void {
  failedDomains.set(domain.trim().toLowerCase(), Date.now());
}

// Test-only: negative caching persists for the module's lifetime, which
// would otherwise leak between unrelated test cases run in the same file.
export function resetLogoDomainFailures(): void {
  failedDomains.clear();
}
