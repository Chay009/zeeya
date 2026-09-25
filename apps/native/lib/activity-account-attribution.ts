import { normalizeBankName } from "./dashboard";

// Single source of truth for which confirmed account an activity message
// belongs to during projection (and for parity checks against the legacy
// UI matchesAccount rule). Bank normalization and last-four extraction live
// here only — never duplicated in SQL or screen code.
export interface ActivityAccountAttributionCandidate {
  id: string;
  bankName: string;
  bankKey: string;
  last4: string;
  currency: string;
}

export function activityAccountLast4(acc: string | null | undefined): string {
  if (!acc) return "";
  return acc.replace(/\D/g, "").slice(-4);
}

export function toActivityAccountAttributionCandidate(
  account: { bankName: string; last4: string; currency: string },
  id: string,
): ActivityAccountAttributionCandidate {
  return {
    id,
    bankName: account.bankName,
    bankKey: normalizeBankName(account.bankName),
    last4: account.last4,
    currency: account.currency,
  };
}

export function resolveActivityAccountId(
  bankName: string | null | undefined,
  acc: string | null | undefined,
  currency: string | null | undefined,
  accounts: readonly ActivityAccountAttributionCandidate[],
): string | null {
  if (!bankName?.trim()) return null;

  const bankKey = normalizeBankName(bankName);
  const resolvedCurrency = currency ?? "INR";
  const messageLast4 = activityAccountLast4(acc);

  const candidates = accounts.filter(
    (account) => account.bankKey === bankKey && account.currency === resolvedCurrency,
  );

  if (messageLast4) {
    return (
      candidates.find((account) => activityAccountLast4(account.last4) === messageLast4)?.id ?? null
    );
  }

  return candidates.length === 1 ? candidates[0]!.id : null;
}

// Legacy UI filter: true when `item` would belong to `selectedAccount` under
// resolveActivityAccountId. Kept for parity tests until SQL account_id
// filtering is the only path in production UI.
export function legacyActivityMatchesAccount(
  evidence: {
    bankName: string | null | undefined;
    accountLast4: string | null | undefined;
    currency: string | null | undefined;
  },
  selectedAccount: { key: string; bankName: string; last4: string; currency: string },
  accounts: readonly { key: string; bankName: string; last4: string; currency: string }[],
): boolean {
  const resolvedId = resolveActivityAccountId(
    evidence.bankName,
    evidence.accountLast4,
    evidence.currency,
    accounts.map((account) =>
      toActivityAccountAttributionCandidate(account, account.key),
    ),
  );
  return resolvedId === selectedAccount.key;
}
