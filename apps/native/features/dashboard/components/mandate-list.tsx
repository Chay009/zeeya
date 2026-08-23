import { Text, View } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { Card } from "@/features/dashboard/components/card";
import { formatDate, formatMoney } from "@/features/dashboard/utils/format";
import type { Mandate, MerchantMandates } from "@/lib/dashboard";

export function MandateList({ groups }: { groups: MerchantMandates[] }) {
  if (groups.length === 0) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <Text
        style={{
          color: t.textPrimary,
          fontWeight: "700",
          fontSize: 16,
          marginBottom: 10,
        }}
      >
        Autopay
      </Text>
      {groups.map((group) => (
        <MerchantMandateGroup key={group.merchant} group={group} />
      ))}
    </Card>
  );
}

// Merchant → mandates → each mandate's own event history, as a tree: a
// merchant can have multiple distinct mandates over time (different UMNs —
// e.g. cancelled and re-subscribed, or genuinely separate plans), and each
// mandate can have multiple lifecycle events (create/execute/cancel), so
// nothing collapses into one misleading row.
function MerchantMandateGroup({ group }: { group: MerchantMandates }) {
  const multi = group.mandates.length > 1;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: "600" }}>
        {group.merchant}
        {multi ? (
          <Text style={{ color: t.textMuted, fontWeight: "400" }}>
            {" "}
            · {group.mandates.length} mandates
          </Text>
        ) : null}
      </Text>
      <View style={{ marginTop: 4, paddingLeft: multi ? 10 : 0, gap: 6 }}>
        {group.mandates.map((man) => (
          <MandateRow key={man.mandateId} mandate={man} />
        ))}
      </View>
    </View>
  );
}

function MandateRow({ mandate }: { mandate: Mandate }) {
  const older = mandate.history.filter((e) => e.date !== mandate.lastUpdated);
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: mandate.status === "active" ? t.positive : t.textMuted,
            }}
          />
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            {mandate.status === "active" ? "Active" : "Cancelled"} ·{" "}
            {formatDate(mandate.lastUpdated)}
          </Text>
        </View>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          {mandate.amount !== null ? formatMoney(mandate.amount, mandate.currency) : "—"}
        </Text>
      </View>
      {older.length > 0 && (
        <View style={{ marginLeft: 12, marginTop: 2 }}>
          {older.map((e) => (
            <Text key={e.date} style={{ color: t.textMuted, fontSize: 11 }}>
              {e.status === "active" ? "Active" : "Cancelled"} · {formatDate(e.date)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
