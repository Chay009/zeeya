import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { Card } from "@/features/dashboard/components/card";
import { formatDateTimeFull, formatMoney } from "@/features/dashboard/utils/format";
import type { AccountBalance, BalanceReading, BankGroup } from "@/lib/dashboard";

export function BankGroupCard({ bank }: { bank: BankGroup }) {
  const [showUnassigned, setShowUnassigned] = useState(false);
  const latestUnassigned = bank.unassignedReadings[0];
  return (
    <Card style={{ marginBottom: 16 }}>
      <Text style={{ color: t.textMuted, fontSize: 12, letterSpacing: 0.5 }}>
        {bank.bankName.toUpperCase()}
      </Text>
      {latestUnassigned && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>
            Latest account-unidentified reading
          </Text>
          <Text style={{ color: t.textPrimary, fontSize: 32, fontWeight: "800" }}>
            {formatMoney(latestUnassigned.balance, latestUnassigned.currency)}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
            Bank reported as of {formatDateTimeFull(latestUnassigned.asOf)} ·{" "}
            {latestUnassigned.sender}
          </Text>
          {latestUnassigned.association.kind === "suggested" && (
            <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 3 }}>
              Probably belongs to ••{latestUnassigned.association.accountLast4} · kept separate
              because this SMS did not contain account digits
            </Text>
          )}
        </View>
      )}
      {bank.accounts.map((account) => (
        <AccountSection
          key={account.last4}
          account={account}
          newerSuggestedReading={bank.unassignedReadings.find(
            (reading) =>
              reading.asOf > account.asOf &&
              reading.association.kind === "suggested" &&
              reading.association.accountLast4 === account.last4,
          )}
        />
      ))}
      {bank.unassignedReadings.length > 0 && (
        <View
          style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 }}
        >
          <Pressable
            onPress={() => setShowUnassigned((visible) => !visible)}
            style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
          >
            <Ionicons
              name={showUnassigned ? "folder-open-outline" : "folder-outline"}
              size={15}
              color={t.textMuted}
            />
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600", flex: 1 }}>
              Unassigned balance readings ({bank.unassignedReadings.length})
            </Text>
            <Ionicons
              name={showUnassigned ? "chevron-down" : "chevron-forward"}
              size={14}
              color={t.textMuted}
            />
          </Pressable>
          {showUnassigned && (
            <View style={{ marginTop: 8, marginLeft: 6, gap: 7 }}>
              {bank.unassignedReadings.map((reading) => (
                <BalanceReadingNode
                  key={`${reading.asOf}-${reading.sender}-${reading.balance}`}
                  reading={reading}
                  latest={false}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function AccountSection({
  account,
  newerSuggestedReading,
}: {
  account: AccountBalance;
  newerSuggestedReading?: BalanceReading;
}) {
  const [showBalanceReadings, setShowBalanceReadings] = useState(false);
  const hasEstimate = account.capturedTransactionCount > 0;
  const displayedBalance = hasEstimate ? account.estimatedBalance : account.balance;
  const reconciliation = account.reconciliationDelta;
  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 }}>
      <Text style={{ color: t.textMuted, fontSize: 12, letterSpacing: 0.5, marginBottom: 8 }}>
        ACCOUNT ••{account.last4}
      </Text>
      <Text style={{ color: t.textPrimary, fontSize: 32, fontWeight: "800" }}>
        {formatMoney(displayedBalance, account.currency)}
      </Text>
      <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
        {hasEstimate ? "Calculated estimate" : "Bank reported"} as of{" "}
        {formatDateTimeFull(hasEstimate ? account.estimatedAsOf : account.asOf)}
        {!hasEstimate ? ` · ${account.sender}` : ""}
      </Text>
      {hasEstimate && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <View>
            <Text style={{ color: t.textMuted, fontSize: 11 }}>Last bank-reported balance</Text>
            <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: "700" }}>
              {formatMoney(account.balance, account.currency)}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 11 }}>
              {formatDateTimeFull(account.asOf)} · {account.sender}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>Added since then</Text>
              <Text style={{ color: t.positive, fontSize: 14, fontWeight: "700" }}>
                +{formatMoney(account.capturedIncome, account.currency)}
              </Text>
            </View>
            <View>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>Spent since then</Text>
              <Text style={{ color: t.negative, fontSize: 14, fontWeight: "700" }}>
                −{formatMoney(account.capturedExpense, account.currency)}
              </Text>
            </View>
          </View>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>
            Net captured change {account.capturedChange >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(account.capturedChange), account.currency)} from{" "}
            {account.capturedTransactionCount} transaction
            {account.capturedTransactionCount === 1 ? "" : "s"}
          </Text>
        </View>
      )}
      {newerSuggestedReading && (
        <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 8 }}>
          A newer account-unidentified bank reading is shown above. Treat this older account
          estimate as historical until the account identity is confirmed.
        </Text>
      )}
      {reconciliation !== null && (
        <Text
          style={{
            color: reconciliation === 0 ? t.positive : t.textMuted,
            fontSize: 11,
            marginTop: 6,
          }}
        >
          Last reconciliation:{" "}
          {reconciliation === 0
            ? "matched captured activity"
            : `${formatMoney(Math.abs(reconciliation), account.currency)} ${
                reconciliation > 0 ? "higher" : "lower"
              } than the captured estimate`}
        </Text>
      )}
      {account.history.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Pressable
            onPress={() => setShowBalanceReadings((visible) => !visible)}
            style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
          >
            <Ionicons
              name={showBalanceReadings ? "folder-open-outline" : "folder-outline"}
              size={15}
              color={t.textMuted}
            />
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600", flex: 1 }}>
              Balance readings ({account.history.length})
            </Text>
            <Ionicons
              name={showBalanceReadings ? "chevron-down" : "chevron-forward"}
              size={14}
              color={t.textMuted}
            />
          </Pressable>
          {showBalanceReadings && (
            <View style={{ marginTop: 8, marginLeft: 6, gap: 7 }}>
              {account.history.map((reading, index) => (
                <BalanceReadingNode
                  key={`${reading.asOf}-${reading.sender}-${reading.balance}`}
                  reading={reading}
                  latest={index === 0}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function BalanceReadingNode({ reading, latest }: { reading: BalanceReading; latest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const reconciliation = reading.reconciliation;
  return (
    <View style={{ borderLeftWidth: 1, borderLeftColor: t.border, paddingLeft: 10 }}>
      <Pressable
        onPress={() => setExpanded((visible) => !visible)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={13}
          color={t.textMuted}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: "600" }}>
            {formatDateTimeFull(reading.asOf)}
            {latest ? " · Latest" : ""}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 10 }}>{reading.sender}</Text>
        </View>
        <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: "600" }}>
          {formatMoney(reading.balance, reading.currency)}
        </Text>
      </Pressable>
      {expanded && (
        <View style={{ marginTop: 6, marginLeft: 19, gap: 3 }}>
          {reading.association.kind === "suggested" && (
            <Text style={{ color: t.textMuted, fontSize: 10 }}>
              Probably belongs to ••{reading.association.accountLast4} · not included in that
              account balance
            </Text>
          )}
          {reading.association.kind === "unassigned" && (
            <Text style={{ color: t.textMuted, fontSize: 10 }}>
              Account number not found · not included in a confirmed account balance
            </Text>
          )}
          {reading.detectedAccount && (
            <Text style={{ color: t.textMuted, fontSize: 10 }}>
              Parsed account {reading.detectedAccount}
            </Text>
          )}
          <Text style={{ color: t.textMuted, fontSize: 10 }}>
            Parsed bank {reading.detectedBankName}
          </Text>
          {reconciliation ? (
            <>
              <Text style={{ color: t.textMuted, fontSize: 10 }}>
                Since {formatDateTimeFull(reconciliation.previousAsOf)}
              </Text>
              <Text style={{ color: t.positive, fontSize: 11 }}>
                Added +{formatMoney(reconciliation.capturedIncome, reading.currency)}
              </Text>
              <Text style={{ color: t.negative, fontSize: 11 }}>
                Spent −{formatMoney(reconciliation.capturedExpense, reading.currency)}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                Expected {formatMoney(reconciliation.expectedBalance, reading.currency)} from{" "}
                {reconciliation.capturedTransactionCount} captured transaction
                {reconciliation.capturedTransactionCount === 1 ? "" : "s"}
              </Text>
              <Text
                style={{
                  color: reconciliation.delta === 0 ? t.positive : t.textMuted,
                  fontSize: 11,
                }}
              >
                {reconciliation.delta === 0
                  ? "Matched captured activity"
                  : `Possible uncaptured ${
                      reconciliation.delta > 0 ? "additions" : "spending"
                    } ${formatMoney(Math.abs(reconciliation.delta), reading.currency)} · reported balance was ${
                      reconciliation.delta > 0 ? "higher" : "lower"
                    }`}
              </Text>
            </>
          ) : reading.association.kind !== "confirmed" ? (
            <Text style={{ color: t.textMuted, fontSize: 11 }}>
              Balance comparison unavailable until the account is identified
            </Text>
          ) : (
            <Text style={{ color: t.textMuted, fontSize: 11 }}>
              First balance reading · no earlier bank balance to compare
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
