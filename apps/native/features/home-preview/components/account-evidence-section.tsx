import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { HomeDetectedAccount, HomeUnassignedReading } from "../data";
import { hp } from "../theme";
import { BankIconPattern } from "./account-card";
import { BrandLogo } from "./brand-logo";

function DetectedAccountRow({ account }: { account: HomeDetectedAccount }) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: hp.border,
        backgroundColor: "rgba(255,255,255,0.72)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BankIconPattern uri={account.bankIcon} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BrandLogo
          letter={account.bankName.charAt(0).toUpperCase() || "?"}
          tile="#e2f4e8"
          ink={hp.emeraldDeep}
          img={account.bankIcon}
          size={34}
          radius={17}
          iconRatio={0.68}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: hp.ink }}>
            {account.bankName}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: hp.muted }}>
            •••• {account.last4} · {account.currency}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: "#e2f4e8",
            paddingHorizontal: 8,
            paddingVertical: 5,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "800", color: hp.emeraldDeep }}>DETECTED</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 12,
          borderTopWidth: 1,
          borderTopColor: hp.borderSoft,
          paddingTop: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="document-text-outline" size={14} color={hp.emeraldDeep} />
          <Text style={{ fontSize: 11, fontWeight: "800", color: hp.inkSoft }}>
            {account.evidenceType}
          </Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 10, color: hp.muted }}>
          {account.evidenceDate} · {account.evidenceSource}
        </Text>
        <Text style={{ marginTop: 8, fontSize: 11, lineHeight: 16, color: hp.muted }}>
          {account.note}
        </Text>
      </View>
    </View>
  );
}

function UnassignedReadingRow({ reading }: { reading: HomeUnassignedReading }) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: hp.border,
        backgroundColor: "rgba(255,255,255,0.72)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BankIconPattern uri={reading.bankIcon} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: "#f1f4ef",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="help-outline" size={16} color={hp.muted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: hp.ink }}>
            {reading.bankName}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 10, color: hp.muted }}>
            Bank reading without account digits
          </Text>
        </View>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: hp.ink }}>
          {reading.balance}
        </Text>
      </View>
      <Text style={{ marginTop: 9, fontSize: 10, color: hp.muted }}>
        {reading.evidenceDate} · {reading.evidenceSource}
      </Text>
      <Text style={{ marginTop: 6, fontSize: 10, lineHeight: 15, color: hp.muted }}>
        {reading.note}
      </Text>
    </View>
  );
}

export function AccountEvidenceSection({
  detectedAccounts,
  unassignedReadings,
}: {
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
}) {
  if (detectedAccounts.length === 0 && unassignedReadings.length === 0) return null;

  const countLabel =
    detectedAccounts.length === 1
      ? "1 identity"
      : detectedAccounts.length > 1
        ? `${detectedAccounts.length} identities`
        : `${unassignedReadings.length} reading${unassignedReadings.length === 1 ? "" : "s"}`;

  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: hp.muted }}>
            OTHER ACCOUNT SIGNALS
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 21,
              fontWeight: "800",
              letterSpacing: -1.25,
              color: hp.ink,
            }}
          >
            Detected accounts
          </Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: hp.emeraldDeep }}>{countLabel}</Text>
      </View>

      <View
        style={{
          marginTop: 10,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          borderRadius: 14,
          backgroundColor: "#e8f6ec",
          padding: 12,
        }}
      >
        <Ionicons name="information-circle-outline" size={16} color={hp.emeraldDeep} />
        <Text style={{ flex: 1, fontSize: 11, lineHeight: 16, color: hp.emeraldDeep }}>
          These are identity signals only. A bank-reported balance is required before an account
          appears in balances or net across accounts.
        </Text>
      </View>

      <View style={{ marginTop: 10, gap: 8 }}>
        {detectedAccounts.map((account) => (
          <DetectedAccountRow key={account.key} account={account} />
        ))}
      </View>

      {unassignedReadings.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: hp.inkSoft }}>
            Bank readings without an account identity
          </Text>
          <View style={{ marginTop: 8, gap: 8 }}>
            {unassignedReadings.map((reading) => (
              <UnassignedReadingRow key={reading.key} reading={reading} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
