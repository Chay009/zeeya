// Runs pending SQLite migrations before the app renders anything that reads
// the local DB. Kept separate from client.native.ts so screens can import
// the connection without pulling in React.
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

// This import always resolves to client.native.ts at typecheck time (see
// tsconfig.json's moduleSuffixes) and NativeDatabaseGate only ever renders
// on native platforms (see DatabaseProvider below) — Metro correctly swaps
// in client.web.ts's `db: null` for an actual web bundle, but that code path
// never reaches this component.
import { db } from "./client";
import migrations from "./migrations/migrations";

function NativeDatabaseGate({ children }: PropsWithChildren) {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-red-500">
          Local database failed to initialize: {error.message}
        </Text>
      </View>
    );
  }

  if (!success) {
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
