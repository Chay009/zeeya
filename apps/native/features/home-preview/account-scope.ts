import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";

import type { HomeAccount } from "./data";

export const ALL_ACCOUNTS_KEY = "all";

export function bankShortName(bankName: string): string {
  return bankName.replace(/\s+bank$/i, "").split(/\s+/)[0] ?? bankName;
}

export function last4Label(last4: string): string {
  const digits = last4.replace(/\D/g, "").slice(-4);
  return digits ? `••${digits}` : last4;
}

export function resolveScopedAccountId(
  accounts: readonly Pick<HomeAccount, "key" | "id">[],
  selectedKey: string,
): string | undefined {
  if (selectedKey === ALL_ACCOUNTS_KEY) return undefined;
  return accounts.find((account) => account.key === selectedKey)?.id;
}

// The "all accounts" case deliberately doesn't repeat bank names here —
// AccountScopeChips right below already lists each bank by name, so a
// caption doing the same thing (e.g. "HDFC · State · Union · 4 accounts")
// was pure duplication, not new information.
export function accountScopeCaption(accounts: HomeAccount[], selectedKey: string): string {
  const selected = accounts.find((account) => account.key === selectedKey);
  if (selected) return `${bankShortName(selected.bankName)} · ${last4Label(selected.last4)}`;
  if (accounts.length === 0) return "No confirmed accounts";
  return `${accounts.length} account${accounts.length === 1 ? "" : "s"}`;
}

function formatBalanceTotals(accounts: HomeAccount[]): string {
  // Summed in integer minor units, converted once per currency.
  const totalsByCurrency = new Map<string, number>();
  for (const account of accounts) {
    if (account.balanceMinorUnits === null) continue;
    totalsByCurrency.set(
      account.currency,
      (totalsByCurrency.get(account.currency) ?? 0) + account.balanceMinorUnits,
    );
  }
  const parts = [...totalsByCurrency]
    .sort(([left], [right]) =>
      left === right ? 0 : left === "INR" ? -1 : right === "INR" ? 1 : left.localeCompare(right),
    )
    .map(([currency, minorUnits]) => formatMoney(fromMinorUnits(minorUnits, currency), currency));
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function scopedHeroBalance(accounts: HomeAccount[], selectedKey: string): string {
  const selected = accounts.find((account) => account.key === selectedKey);
  if (selected) return selected.balance;
  return formatBalanceTotals(accounts);
}
