export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (new URL(path).hostname === "expo-sharing") return "/import-shared-message";
  } catch {
    // Ordinary relative Expo Router paths are not absolute URLs.
  }
  return path;
}
