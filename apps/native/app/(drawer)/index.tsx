import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  deriveDashboard,
  isRecurringTransaction,
  type AccountBalance,
  type Mandate,
  type MerchantMandates,
} from "@/lib/dashboard";
import {
  isSmsReadSupported,
  type ParsedSms,
  parseInboxMessages,
  readSmsInbox,
  requestSmsReadPermission,
} from "@/lib/sms";
import { subscriptionMonthlyTotals } from "@/lib/subscriptions";
import { trxDirection } from "@/lib/transaction-direction";

type Status = "checking" | "needs-permission" | "loading" | "ready" | "unsupported" | "error";

// maximumFractionDigits: 2 (not a forced 0) so a ₹199.99 charge doesn't
// silently round to ₹200 — toLocaleString only prints decimals when the
// amount actually has them, so whole amounts still render without ".00".
function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : currency + " ";
  return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Currencies present across a set of per-currency totals, INR first (this
// app's primary currency) then the rest alphabetically — so a single-currency
// user always sees the familiar single row, and mixed-currency activity adds
// rows instead of being silently summed together.
function currenciesOf(...records: Record<string, number>[]): string[] {
  const set = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) set.add(k);
  if (set.size === 0) set.add("INR");
  return [...set].sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));
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

// Full precision (date + time + year, always) — used where telling two
// readings apart matters, since day/month alone can hide same-day-different-
// time orderings or make cross-year mixups look ambiguous.
function formatDateTimeFull(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ParsedSms[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Bumped on every load() call so a slow, stale in-flight read can't
  // overwrite a newer one's result if a refresh is triggered before the
  // previous one finished.
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!isSmsReadSupported()) {
      setStatus("unsupported");
      return;
    }
    const id = ++loadIdRef.current;
    try {
      const raw = await readSmsInbox();
      if (id !== loadIdRef.current) return;
      setMessages(parseInboxMessages(raw));
      setStatus("ready");
    } catch (e) {
      if (id !== loadIdRef.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!isSmsReadSupported()) {
      setStatus("unsupported");
      return;
    }
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
      .then((granted) => {
        if (granted) void load();
        else setStatus("needs-permission");
      })
      .catch((e: unknown) => {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [load]);

  const connect = useCallback(async () => {
    setStatus("loading");
    try {
      const granted = await requestSmsReadPermission();
      if (!granted) {
        setStatus("needs-permission");
        return;
      }
      await load();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
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
                  zeeya reads your bank and transaction messages on-device to build this dashboard.
                  Your SMS content never leaves your phone.
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
                {currenciesOf(
                  dashboard.monthIncomeByCurrency,
                  dashboard.monthExpenseByCurrency,
                ).map((currency) => (
                  <StatRow
                    key={currency}
                    currency={currency}
                    income={dashboard.monthIncomeByCurrency[currency] ?? 0}
                    expense={dashboard.monthExpenseByCurrency[currency] ?? 0}
                  />
                ))}

                {dashboard.accounts.map((acc) => (
                  <AccountCard key={`${acc.bankName}-${acc.last4 ?? ""}`} account={acc} />
                ))}

                {dashboard.mandatesByMerchant.length > 0 && (
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
                    {dashboard.mandatesByMerchant.map((group) => (
                      <MerchantMandateGroup key={group.merchant} group={group} />
                    ))}
                  </Card>
                )}

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
                        Recurring payments
                      </Text>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>
                        {subscriptionTotalsLabel(
                          subscriptionMonthlyTotals(dashboard.subscriptions),
                        )}{" "}
                        / month
                      </Text>
                    </View>
                    {dashboard.subscriptions.map((sub) => (
                      <View
                        key={`${sub.merchant}-${sub.currency}`}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: t.textPrimary, fontSize: 13 }}>
                          {sub.merchant}{" "}
                          <Text style={{ color: t.textMuted }}>
                            · seen {sub.count}x ·{" "}
                            {sub.confidence === "likely" ? "Likely" : "Possible"}
                          </Text>
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
        renderItem={({ item }) => (
          <TransactionRow item={item} isRecurring={isRecurringTransaction(item, dashboard)} />
        )}
      />
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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

function StatRow({
  currency,
  income,
  expense,
}: {
  currency: string;
  income: number;
  expense: number;
}) {
  const net = income - expense;
  return (
    <Card style={{ marginBottom: 16, flexDirection: "row", gap: 16 }}>
      <Stat
        label={currency === "INR" ? "Income" : `Income (${currency})`}
        value={formatMoney(income, currency)}
        color={t.positive}
        icon="trending-up"
      />
      <Stat
        label={currency === "INR" ? "Expenses" : `Expenses (${currency})`}
        value={formatMoney(expense, currency)}
        color={t.negative}
        icon="trending-down"
      />
      <Stat
        label="Net"
        value={formatMoney(net, currency)}
        color={net >= 0 ? t.positive : t.negative}
        icon="swap-horizontal"
      />
    </Card>
  );
}

// One "₹1,234" per currency present, joined — subscriptions can be in
// different currencies, and summing them as raw numbers would be as wrong
// as the monthly income/expense totals this mirrors.
function subscriptionTotalsLabel(totalsByCurrency: Record<string, number>): string {
  const parts = Object.entries(totalsByCurrency).map(([currency, amount]) =>
    formatMoney(amount, currency),
  );
  // No "likely" subscriptions yet (only lower-confidence "possible" ones) —
  // don't claim a monthly total with nothing behind it.
  return parts.length > 0 ? parts.join(" + ") : "—";
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
        As of {formatDateTimeFull(account.asOf)} · {account.sender}
      </Text>
      {older.length > 0 && (
        <View style={{ marginTop: 10, gap: 4 }}>
          {older.map((r) => (
            <View key={r.asOf} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                {formatDateTimeFull(r.asOf)} · {r.sender}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                {formatMoney(r.balance, r.currency)}
              </Text>
            </View>
          ))}
        </View>
      )}
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

function TransactionRow({ item, isRecurring }: { item: ParsedSms; isRecurring: boolean }) {
  const { result } = item;
  const label = result.brandName ?? result.vendor ?? result.bankName ?? item.sender;
  const direction = trxDirection(result.trxTypeRich);
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
          {isRecurring ? " · Recurring" : ""}
        </Text>
      </View>
      {amount !== null && (
        <Text
          style={{
            color:
              direction === "expense"
                ? t.negative
                : direction === "income"
                  ? t.positive
                  : t.textMuted,
            fontWeight: "700",
            fontSize: 15,
          }}
        >
          {direction === "expense" ? "-" : direction === "income" ? "+" : ""}
          {formatMoney(amount, result.currency ?? "INR")}
        </Text>
      )}
    </View>
  );
}
