type GoogleConfiguration = { webClientId: string; iosClientId: string | null };
type ConfigurableGoogleSdk = {
  GoogleOneTapSignIn: { configure(configuration: GoogleConfiguration): void };
};

/** Optional identity must never prevent access to on-device finances. */
export function configureGoogleSignIn<T extends ConfigurableGoogleSdk>(
  configuration: GoogleConfiguration,
  load: () => T,
): T | null {
  try {
    const sdk = load();
    sdk.GoogleOneTapSignIn.configure(configuration);
    return sdk;
  } catch {
    return null;
  }
}
