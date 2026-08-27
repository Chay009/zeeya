import { Pressable, Text } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { Card } from "@/features/dashboard/components/card";
import type { Status } from "@/features/dashboard/hooks/use-dashboard-sync";

export function StatusCards({
  status,
  error,
  onConnect,
}: {
  status: Status;
  error: string | null;
  onConnect: () => Promise<void>;
}) {
  return (
    <>
      {status === "checking" && <Text style={{ color: t.textMuted }}>Checking permissions…</Text>}

      {status === "unsupported" && (
        <Card>
          <Text style={{ color: t.textPrimary, fontWeight: "600", marginBottom: 4 }}>
            Android only
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            Reading the SMS inbox isn't possible on iOS — Apple blocks third-party apps from
            accessing it entirely.
          </Text>
        </Card>
      )}

      {status === "needs-permission" && (
        <Card>
          <Text style={{ color: t.textPrimary, fontWeight: "600", marginBottom: 4 }}>
            Connect your SMS inbox
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 14 }}>
            zeeya reads your bank and transaction messages on-device and listens for newly received
            messages so this dashboard stays current. Your SMS content never leaves your phone.
          </Text>
          <Pressable
            onPress={onConnect}
            style={{
              backgroundColor: t.accent,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: t.background, fontWeight: "700" }}>Allow SMS Access</Text>
          </Pressable>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <Text style={{ color: t.negative, fontWeight: "600", marginBottom: 4 }}>
            Couldn't read inbox
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{error}</Text>
        </Card>
      )}

      {status === "loading" && (
        <Text style={{ color: t.textMuted }}>Reading and parsing your inbox…</Text>
      )}
    </>
  );
}
