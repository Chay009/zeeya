import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  PermissionsAndroid,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { TransactionAvatar } from "@/components/transaction-avatar";
import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { deriveDashboard, type AccountBalance } from "@/lib/dashboard";
import {
  isSmsReadSupported,
  type ParsedSms,
  parseInboxMessages,
  readSmsInbox,
  requestSmsReadPermission,
} from "@/lib/sms";

type Status = "checking" | "needs-permission" | "loading" | "ready" | "unsupported" | "error";

function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : currency + " ";
  return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    "en-IN",
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ParsedSms[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isSmsReadSupported()) {
      setStatus("unsupported");
      return;
    }
    try {
      const raw = await readSmsInbox();
      setMessages(parseInboxMessages(raw));
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!isSmsReadSupported()) {
      setStatus("unsupported");
      return;
    }
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS).then((granted) => {
      if (granted) void load();
      else setStatus("needs-permission");
    });
  }, [load]);

  const connect = useCallback(async () => {
    setStatus("loading");
    const granted = await requestSmsReadPermission();
    if (!granted) {
      setStatus("needs-permission");
      return;
    }
    await load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const dashboard = useMemo(() => deriveDashboard(messages), [messages]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <StatusBar barStyle="light-content" />
      <FlatList
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        data={status === "ready" ? dashboard.recent.slice(0, 25) : []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />
        }
        ListHeaderComponent={
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <Text style={{ color: t.textPrimary, fontSize: 24, fontWeight: "800" }}>zeeya</Text>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={t.textMuted} />
            </View>

            {status === "checking" && (
              <Text style={{ color: t.textMuted }}>Checking permissions…</Text>
            )}

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
                  zeeya reads your bank and transaction messages on-device to build this
                  dashboard. Nothing ever leaves your phone.
                </Text>
                <Pressable
                  onPress={connect}
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

            {status === "ready" && (
              <>
                <StatRow income={dashboard.monthIncome} expense={dashboard.monthExpense} />

                {dashboard.accounts.map((acc) => (
                  <AccountCard key={`${acc.bankName}-${acc.last4 ?? ""}`} account={acc} />
                ))}

                {dashboard.subscriptions.length > 0 && (
                  <Card style={{ marginBottom: 16 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: t.textPrimary, fontWeight: "700", fontSize: 16 }}>
                        {dashboard.subscriptions.length} Subscription
                        {dashboard.subscriptions.length === 1 ? "" : "s"}
                      </Text>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>
                        {formatMoney(
                          dashboard.subscriptions.reduce((s, x) => s + x.amount, 0),
                          "INR",
                        )}{" "}
                        / month
                      </Text>
                    </View>
                    {dashboard.subscriptions.map((sub) => (
                      <View
                        key={`${sub.merchant}-${sub.amount}`}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: t.textPrimary, fontSize: 13 }}>
                          {sub.merchant}{" "}
                          <Text style={{ color: t.textMuted }}>· seen {sub.count}x</Text>
                        </Text>
                        <Text style={{ color: t.textMuted, fontSize: 13 }}>
                          {formatMoney(sub.amount, sub.currency)}
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}

                <Text
                  style={{
                    color: t.accent,
                    fontWeight: "700",
                    fontSize: 15,
                    marginBottom: 12,
                    marginTop: 4,
                  }}
                >
                  Recent
                </Text>

                {dashboard.recent.length === 0 && (
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>
                    No bank or transaction messages recognized yet.
                  </Text>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <TransactionRow item={item} />}
      />
    </View>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: t.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function StatRow({ income, expense }: { income: number; expense: number }) {
  const net = income - expense;
  return (
    <Card style={{ marginBottom: 16, flexDirection: "row", gap: 16 }}>
      <Stat label="Income" value={formatMoney(income, "INR")} color={t.positive} icon="trending-up" />
      <Stat label="Expenses" value={formatMoney(expense, "INR")} color={t.negative} icon="trending-down" />
      <Stat
        label="Net"
        value={formatMoney(net, "INR")}
        color={net >= 0 ? t.positive : t.negative}
        icon="swap-horizontal"
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <Ionicons name={icon} size={13} color={color} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
      </View>
      <Text style={{ color, fontWeight: "700", fontSize: 15 }}>{value}</Text>
    </View>
  );
}

function AccountCard({ account }: { account: AccountBalance }) {
  const older = account.history.filter((r) => r.asOf !== account.asOf);
  return (
    <Card style={{ marginBottom: 16 }}>
      <Text style={{ color: t.textMuted, fontSize: 12, letterSpacing: 0.5, marginBottom: 8 }}>
        {account.bankName.toUpperCase()}
        {account.last4 ? ` ••${account.last4}` : ""}
      </Text>
      <Text style={{ color: t.textPrimary, fontSize: 32, fontWeight: "800" }}>
        {formatMoney(account.balance, account.currency)}
      </Text>
      <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
        As of {formatDate(account.asOf)}
      </Text>
      {older.length > 0 && (
        <View style={{ marginTop: 10, gap: 4 }}>
          {older.map((r) => (
            <View
              key={r.asOf}
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ color: t.textMuted, fontSize: 11 }}>{formatDate(r.asOf)}</Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                {formatMoney(r.balance, account.currency)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function TransactionRow({ item }: { item: ParsedSms }) {
  const { result } = item;
  const label = result.brandName ?? result.vendor ?? result.bankName ?? item.sender;
  const isExpense = result.trxTypeRich
    ? ["EXPENSE", "AUTO_DEBIT", "WALLET_DEBIT", "ATM_WITHDRAWAL"].includes(result.trxTypeRich)
    : false;
  const amount = result.trx ? Number.parseFloat(result.trx.replace(/,/g, "")) : null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: t.surfaceMuted,
        borderRadius: 16,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <TransactionAvatar label={label} category={result.merchantCategory} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: t.textPrimary, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>
          {formatDate(item.date)}
          {result.subcategory === "recurring" ? " · Recurring" : ""}
        </Text>
      </View>
      {amount !== null && (
        <Text
          style={{
            color: isExpense ? t.negative : t.positive,
            fontWeight: "700",
            fontSize: 15,
          }}
        >
          {isExpense ? "-" : "+"}
          {formatMoney(amount, result.currency ?? "INR")}
        </Text>
      )}
    </View>
  );
}
