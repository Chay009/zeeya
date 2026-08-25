// Runs pending SQLite migrations before the app renders anything that reads
// the local DB. Kept separate from client.native.ts so screens can import
// the connection without pulling in React.
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

// This import always resolves to client.native.ts at typecheck time (see
// tsconfig.json's moduleSuffixes) and NativeDatabaseGate only ever renders
// on native platforms (see DatabaseProvider below) — Metro correctly swaps
// in client.web.ts's `db: null` for an actual web bundle, but that code path
// never reaches this component.
import { db, migrateLegacyDatabaseIfNeeded } from "./client";
import migrations from "./migrations/migrations";

function NativeDatabaseGate({ children }: PropsWithChildren) {
  const { success, error } = useMigrations(db, migrations);
  const [legacyMigrationComplete, setLegacyMigrationComplete] = useState(false);
  const [legacyMigrationError, setLegacyMigrationError] = useState<Error | null>(null);

  useEffect(() => {
    if (error) void SplashScreen.hideAsync();
  }, [error, success]);

  useEffect(() => {
    if (!success) return;
    try {
      migrateLegacyDatabaseIfNeeded();
      setLegacyMigrationComplete(true);
    } catch (cause) {
      setLegacyMigrationError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      void SplashScreen.hideAsync();
    }
  }, [success]);

  const initializationError = error ?? legacyMigrationError;
  if (initializationError) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-red-500">
          Local database failed to initialize: {initializationError.message}
        </Text>
      </View>
    );
  }

  if (!success || !legacyMigrationComplete) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return children;
}

export function DatabaseProvider({ children }: PropsWithChildren) {
  // No local DB on web (see db/client.ts) — nothing in the product currently
  // reads or writes it there, so render straight through rather than
  // attempting migrations against a connection that doesn't exist.
  if (Platform.OS === "web") return children;
  return <NativeDatabaseGate>{children}</NativeDatabaseGate>;
}
