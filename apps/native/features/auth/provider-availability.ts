export type AuthProvider = "google" | "apple";

interface ProviderAvailabilityInput {
  platform: string;
  googleConfigured: boolean;
  googleNativeReady: boolean;
  appleNativeReady: boolean;
  server: { google: boolean; apple: boolean };
}

/** A provider is offered only when both this binary and the server support it. */
export function resolveProviderAvailability(input: ProviderAvailabilityInput): {
  providers: AuthProvider[];
  reason: string | null;
} {
  const apple = input.platform === "ios" && input.appleNativeReady && input.server.apple;
  const google =
    input.googleConfigured &&
    input.googleNativeReady &&
    input.server.google &&
    (input.platform !== "ios" || apple);
  const providers: AuthProvider[] = [];
  if (google) providers.push("google");
  if (apple) providers.push("apple");
  if (providers.length > 0) return { providers, reason: null };
  if (!input.server.google && !input.server.apple) {
    return {
      providers,
      reason: "Sign-in has not been enabled on the server. You can continue using Zeeya offline.",
    };
  }
  if (input.platform === "ios" && !apple) {
    return {
      providers,
      reason:
        "Apple sign-in must be configured for this iOS app before account sign-in is available.",
    };
  }
  if (!input.googleConfigured) {
    return {
      providers,
      reason:
        "This app is missing its Google client ID. Install an app build with sign-in configured.",
    };
  }
  return {
    providers,
    reason:
      "Google sign-in is not available in this app build. Install the latest APK; your local data can stay on this device.",
  };
}
