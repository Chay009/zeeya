import { View, Text } from "react-native";

import { TransactionAvatar } from "@/components/transaction-avatar";
import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { formatDate, formatMoney } from "@/features/dashboard/utils/format";
import { ACTIVITY_CATEGORY_FILTERS } from "@/lib/activity-filters";
import type { ParsedSms } from "@/lib/sms";
import { trxDirection } from "@/lib/transaction-direction";

export function ActivityRow({ item, isRecurring }: { item: ParsedSms; isRecurring: boolean }) {
  const { result } = item;
  const label = result.brandName ?? result.vendor ?? result.bankName ?? item.sender;
  const direction = trxDirection(result.trxTypeRich);
  const amount = result.trx ? Number.parseFloat(result.trx.replace(/,/g, "")) : null;
  const category = ACTIVITY_CATEGORY_FILTERS.find(
    (option) => option.value === result.matchedCategories?.[0],
  )?.label;

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
          {category ? ` · ${category}` : ""}
          {isRecurring ? " · Recurring" : ""}
        </Text>
        {result.bankName && result.bankName !== label && (
          <Text style={{ color: t.textMuted, fontSize: 11 }}>{result.bankName}</Text>
        )}
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
