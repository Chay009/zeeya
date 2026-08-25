// Web counterpart to client.native.ts (Metro's platform-extension
// convention resolves `./client` to this file on web automatically). No
// static `expo-sqlite` import here at all — that's the actual fix: a
// Platform.OS runtime check inside a single shared file still lets Metro
// bundle expo-sqlite's web backend (wa-sqlite + a Web Worker, needing
// SharedArrayBuffer/COOP/COEP this app doesn't configure) into the web
// build, even if the code path that calls it never runs. Splitting the file
// means the web bundle never references expo-sqlite at all.
//
// There is currently no SMS data source on web to persist (SMS reading is
// Android-only by OS design — see lib/sms.ts's isSmsReadSupported), so this
// is a real "not supported yet" rather than a stub masking a gap.
export const sqlite = null;
export const db = null;

export function migrateLegacyDatabaseIfNeeded(): void {}

export type Database = never;
