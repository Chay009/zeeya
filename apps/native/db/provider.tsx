// Runs pending SQLite migrations before the app renders anything that reads
// the local DB. Kept separate from client.ts so screens can import the
// connection without pulling in React.
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { db } from "./client";
import migrations from "./migrations/migrations";

function NativeDatabaseGate({ children }: PropsWithChildren) {
  // db is non-null here — this component only renders on native platforms
  // (see DatabaseProvider below), where client.ts always opens a connection.
  const { success, error } = useMigrations(db as NonNullable<typeof db>, migrations);

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
