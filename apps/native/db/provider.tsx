// Runs pending SQLite migrations before the app renders anything that reads
// the local DB. Kept separate from client.ts so screens can import the
// connection without pulling in React.
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { db } from "./client";
import migrations from "./migrations/migrations";

export function DatabaseProvider({ children }: PropsWithChildren) {
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
