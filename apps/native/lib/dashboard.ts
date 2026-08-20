import { trxDirection } from "./transaction-direction";
import {
  deriveSubscriptions,
  isInferredRecurringTransaction,
  type Subscription,
} from "./subscriptions";
import type { ParsedSms } from "./sms";
import { hasVisibleActivityCategory } from "./activity-filters";

export type { Subscription, SubscriptionConfidence } from "./subscriptions";

export interface BalanceReconciliation {
  previousAsOf: number;
  capturedIncome: number;
  capturedExpense: number;
  capturedChange: number;
  capturedTransactionCount: number;
  expectedBalance: number;
  // Reported balance minus the balance predicted from the previous reading
  // and captured transactions. This exposes activity the SMS window/parser
  // did not capture instead of silently folding it into the next balance.
  delta: number;
}

export interface BalanceReading {
  balance: number;
  currency: string;
  asOf: number;
  detectedBankName: string;
  detectedAccount: string | null;
  association: BalanceAssociation;
  // The raw SMS sender ID this reading came from (e.g. "VM-SBIINB") — lets
  // a reading be traced back to the actual message that produced it.
  sender: string;
  // Insight for the interval from the immediately preceding bank balance to
  // this reading. The oldest reading (or a currency boundary) has no interval.
  reconciliation: BalanceReconciliation | null;
}

export type BalanceAssociation =
  | { kind: "confirmed"; accountLast4: string }
  | { kind: "suggested"; accountLast4: string; reason: "sole-account" }
  | { kind: "unassigned" };

export interface AccountBalance {
  bankName: string;
  last4: string;
  // Latest balance explicitly reported by the bank. This remains the
  // reconciliation anchor and is never overwritten by our estimate.
  balance: number;
  currency: string;
  asOf: number;
  sender: string;
  // Best local estimate after applying captured transactions newer than
  // `asOf`. It is explicitly labelled as estimated in the UI.
  estimatedBalance: number;
  capturedIncome: number;
  capturedExpense: number;
  capturedChange: number;
  capturedTransactionCount: number;
  estimatedAsOf: number;
  // Latest reported balance minus the balance predicted from the previous
  // report and captured transactions between them. A non-zero value exposes
  // activity the SMS window/parser did not capture instead of hiding drift.
  reconciliationDelta: number | null;
  // Every balance reading seen for this account, newest first, including
  // ones older than the current `balance` — nothing the parser extracted is
  // dropped, it's just not all shown as the headline figure.
  history: BalanceReading[];
}

export interface BankGroup {
  bankName: string;
  accounts: AccountBalance[];
  // Readings where Malana did not extract account digits. They stay visible
  // without being allowed to create or mutate a confirmed account.
  unassignedReadings: BalanceReading[];
}

export interface MandateEvent {
  status: "active" | "cancelled";
  date: number;
  sender: string;
}

export interface Mandate {
  mandateId: string;
  merchant: string;
  amount: number | null;
  currency: string;
  // Status as of the latest message referencing this mandateId — a mandate
  // stays "active" until a message with the real RESCHE-derived cancellation
  // signal (see enrichment.ts's isMandateCancelled) is seen for the same UMN.
  status: "active" | "cancelled";
  createdAt: number;
  lastUpdated: number;
  sender: string;
  // Every mandate-context message seen for this UMN, newest first — the
  // create/execute/cancel timeline, not just the current status. A message
  // that doesn't flip the status (e.g. an execution) still shows up here.
  history: MandateEvent[];
}

export interface MerchantMandates {
  merchant: string;
  mandates: Mandate[];
}

export interface Dashboard {
  // Flat confirmed-account view retained for account-level consumers and
  // tests. `banks` is the canonical presentation hierarchy used by the UI.
  accounts: AccountBalance[];
  banks: BankGroup[];
  // Keyed by ISO currency code — summing across currencies as raw numbers
  // would silently mix e.g. INR and USD into one meaningless total.
  monthIncomeByCurrency: Record<string, number>;
  monthExpenseByCurrency: Record<string, number>;
  subscriptions: Subscription[];
  mandates: Mandate[];
  mandatesByMerchant: MerchantMandates[];
  // All product-visible category matches, including non-transaction travel,
  // delivery, event, appointment, alert, OTP, and offer messages.
  activity: ParsedSms[];
  // Financial transactions only; retained for transaction-specific consumers.
  recent: ParsedSms[];
}

function isParserRecognized(message: ParsedSms): boolean {
  return message.result.category !== null || (message.result.matchedCategories?.length ?? 0) > 0;
}

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// Different SMS from the same bank mask the account number differently
// ("1234", "XX1234", "*1234", or missing entirely) — normalize to just the
// trailing digits so the same real account doesn't produce multiple cards.
function normalizeAcc(acc: string | null): string {
  if (!acc) return "";
  const digits = acc.replace(/\D/g, "");
  return digits.slice(-4);
}

function normalizeBankName(bankName: string): string {
  return bankName.trim().replace(/\s+/g, " ").toLowerCase();
}

function displayBankName(bankName: string): string {
  return bankName.trim().replace(/\s+/g, " ");
}

function accountKey(bankName: string, acc: string | null): string | null {
  const normalizedAcc = normalizeAcc(acc);
  return normalizedAcc ? `${normalizeBankName(bankName)}|${normalizedAcc}` : null;
}

function signedTransactionChange(message: ParsedSms): number | null {
  const { result } = message;
  if (!result.trxTypeRich) return null;
  const amount = parseAmount(result.trx);
  if (amount === null) return null;
  const direction = trxDirection(result.trxTypeRich);
  if (direction === "neutral") return null;
  return direction === "income" ? amount : -amount;
}

function resolveTransactionAccountKey(
  message: ParsedSms,
  accountsByKey: Map<string, AccountBalance>,
): string | null {
  const { result } = message;
  if (!result.bankName) return null;
  const bankName = result.bankName;
  const currency = result.currency ?? "INR";
  const exactKey = accountKey(bankName, result.acc);
  if (exactKey) {
    const exactAccount = accountsByKey.get(exactKey);
    if (exactAccount?.currency !== currency) return null;

    // Bank-name normalization is deliberately allowed to group balance
    // readings into one UI account, but it must not silently broaden ledger
    // attribution. Preserve the previously validated estimate behaviour by
    // requiring the transaction's parsed bank name to exactly match the latest
    // confirmed balance anchor's parsed bank name.
    const latestReading = exactAccount.history.reduce((latest, reading) =>
      reading.asOf > latest.asOf ? reading : latest,
    );
    return latestReading.detectedBankName === bankName ? exactKey : null;
  }

  // A large share of real bank transaction SMS omit account digits. Retain
  // the validated estimate behaviour only when the bank and currency leave a
  // single possible confirmed account. Sender IDs never participate, and an
  // ambiguous multi-account transaction remains unapplied.
  const candidates = [...accountsByKey.entries()].filter(
    ([, account]) => account.bankName === bankName && account.currency === currency,
  );
  return candidates.length === 1 ? candidates[0]![0] : null;
}

function referencedTransactionKey(message: ParsedSms): string | null {
  const { result } = message;
  const amount = parseAmount(result.trx);
  if (!result.ref || !result.trxTypeRich || amount === null) return null;

  const direction = trxDirection(result.trxTypeRich);
  const institution = (result.bankName ?? message.sender).trim().toLowerCase();
  const reference = result.ref.replace(/\s/g, "").toLowerCase();
  const currency = result.currency ?? "INR";
  return [institution, normalizeAcc(result.acc), reference, amount, currency, direction].join("|");
}

// Orchestrates the Dashboard model: latest known balance per bank account,
// currency-separated income/expense totals for the current month, mandate
// (Autopay) lifecycle aggregation — confirmed parser data, kept here rather
// than in subscriptions.ts because it isn't inference — inferred recurring
// payments (delegated to subscriptions.ts), and the most recent recognized
// transactions. All derived client-side from what Malana already extracted.
// No message is ever excluded from this derivation; unrecognized ones just
// don't contribute to any bucket.
//
// `now` is injectable (defaults to the real clock) so tests can assert an
// exact-day boundary (e.g. "included at exactly 60 days old") without
// racing the small drift between when a test captures its own reference
// time and when this function calls `new Date()` internally.
export function deriveDashboard(messages: ParsedSms[], now: Date = new Date()): Dashboard {
  const accountsByKey = new Map<string, AccountBalance>();
  const unassignedReadingsByBank = new Map<string, BalanceReading[]>();
  const monthIncomeByCurrency: Record<string, number> = {};
  const monthExpenseByCurrency: Record<string, number> = {};
  const mandatesById = new Map<string, Mandate>();
  const recognized: ParsedSms[] = [];
  const newestReferencedTransaction = new Map<string, ParsedSms>();
  for (const message of messages) {
    if (!isParserRecognized(message)) continue;
    const key = referencedTransactionKey(message);
    if (!key) continue;
    const current = newestReferencedTransaction.get(key);
    if (!current || message.date > current.date) newestReferencedTransaction.set(key, message);
  }
  const processedReferencedTransactions = new Set<string>();
  const deduplicatedMessages: ParsedSms[] = [];

  for (const m of messages) {
    const { result } = m;
    if (!isParserRecognized(m)) continue;

    const transactionKey = referencedTransactionKey(m);
    const isDuplicateTransaction = transactionKey
      ? newestReferencedTransaction.get(transactionKey) !== m ||
        processedReferencedTransactions.has(transactionKey)
      : false;
    if (transactionKey && !isDuplicateTransaction) {
      processedReferencedTransactions.add(transactionKey);
    }
    if (!isDuplicateTransaction) deduplicatedMessages.push(m);

    if (result.mandateId) {
      const merchant = result.mandateMerchant ?? result.brandName ?? result.bankName ?? m.sender;
      const amount = parseAmount(result.mandateAmount);
      const status = result.mandateEvent ?? "active";
      const event: MandateEvent = { status, date: m.date, sender: m.sender };
      const existing = mandatesById.get(result.mandateId);
      if (!existing) {
        mandatesById.set(result.mandateId, {
          mandateId: result.mandateId,
          merchant,
          amount,
          currency: result.currency ?? "INR",
          status,
          createdAt: m.date,
          lastUpdated: m.date,
          sender: m.sender,
          history: [event],
        });
      } else {
        existing.history.push(event);
        if (amount !== null && existing.amount === null) existing.amount = amount;
        if (m.date < existing.createdAt) existing.createdAt = m.date;
        if (m.date > existing.lastUpdated) {
          existing.lastUpdated = m.date;
          existing.status = status;
          existing.sender = m.sender;
        }
      }
    }

    if (result.bal && result.bankName) {
      const normalizedAcc = normalizeAcc(result.acc);
      // Only parsed account digits establish account identity. Sender IDs are
      // delivery-channel metadata and can vary for one account, so they must
      // never create account cards. Do not pad or suffix-match partial digits
      // ("12" vs "0012"): that can silently merge two real accounts.
      const key = accountKey(result.bankName, result.acc);
      const balance = parseAmount(result.bal);
      if (balance !== null) {
        const currency = result.currency ?? "INR";
        const reading: BalanceReading = {
          balance,
          currency,
          asOf: m.date,
          detectedBankName: result.bankName,
          detectedAccount: result.acc,
          association: normalizedAcc
            ? { kind: "confirmed", accountLast4: normalizedAcc }
            : { kind: "unassigned" },
          sender: m.sender,
          reconciliation: null,
        };
        if (!key) {
          const bankKey = normalizeBankName(result.bankName);
          const unassigned = unassignedReadingsByBank.get(bankKey);
          if (unassigned) unassigned.push(reading);
          else unassignedReadingsByBank.set(bankKey, [reading]);
        } else {
          const existing = accountsByKey.get(key);
          if (!existing) {
            accountsByKey.set(key, {
              bankName: result.bankName,
              last4: normalizedAcc,
              balance,
              currency,
              asOf: m.date,
              sender: m.sender,
              estimatedBalance: balance,
              capturedIncome: 0,
              capturedExpense: 0,
              capturedChange: 0,
              capturedTransactionCount: 0,
              estimatedAsOf: m.date,
              reconciliationDelta: null,
              history: [reading],
            });
          } else {
            existing.history.push(reading);
            if (m.date > existing.asOf) {
              existing.balance = balance;
              existing.asOf = m.date;
              existing.sender = m.sender;
              existing.currency = currency;
              existing.estimatedBalance = balance;
              existing.capturedIncome = 0;
              existing.capturedExpense = 0;
              existing.capturedChange = 0;
              existing.capturedTransactionCount = 0;
              existing.estimatedAsOf = m.date;
            }
          }
        }
      }
    }

    if (!isDuplicateTransaction && result.trxTypeRich && isSameMonth(new Date(m.date), now)) {
      const amount = parseAmount(result.trx);
      if (amount !== null) {
        const currency = result.currency ?? "INR";
        const direction = trxDirection(result.trxTypeRich);
        if (direction === "expense") {
          monthExpenseByCurrency[currency] = (monthExpenseByCurrency[currency] ?? 0) + amount;
        } else if (direction === "income") {
          monthIncomeByCurrency[currency] = (monthIncomeByCurrency[currency] ?? 0) + amount;
        }
      }
    }

    // A trxTypeRich tag alone isn't proof of an actual transaction — e.g. a
    // telecom "your plan is valid till..." notice can trigger the RECHARGE
    // tag without being a real recharge purchase. Require a real parsed
    // amount too, so informational notices don't show up as transactions.
    if (!isDuplicateTransaction && result.trxTypeRich && parseAmount(result.trx) !== null) {
      recognized.push(m);
    }
  }

  const ledgerEntries = deduplicatedMessages.flatMap((message) => {
    const key = resolveTransactionAccountKey(message, accountsByKey);
    const change = signedTransactionChange(message);
    return key && change !== null ? [{ key, change, message }] : [];
  });

  for (const [key, account] of accountsByKey) {
    const readings = [...account.history].sort((a, b) => b.asOf - a.asOf);
    for (let index = 0; index < readings.length; index++) {
      const reading = readings[index]!;
      const previous = readings[index + 1];
      if (!previous || previous.currency !== reading.currency) continue;

      let capturedIncome = 0;
      let capturedExpense = 0;
      let capturedTransactionCount = 0;
      for (const { key: transactionKey, change, message } of ledgerEntries) {
        if (transactionKey !== key) continue;
        if (message.date <= previous.asOf || message.date >= reading.asOf) continue;
        if (change > 0) capturedIncome += change;
        else capturedExpense += Math.abs(change);
        capturedTransactionCount++;
      }
      const capturedChange = capturedIncome - capturedExpense;
      const expectedBalance = previous.balance + capturedChange;
      reading.reconciliation = {
        previousAsOf: previous.asOf,
        capturedIncome,
        capturedExpense,
        capturedChange,
        capturedTransactionCount,
        expectedBalance,
        delta: reading.balance - expectedBalance,
      };
    }
    account.reconciliationDelta = readings[0]?.reconciliation?.delta ?? null;

    for (const { key: transactionKey, change, message } of ledgerEntries) {
      if (transactionKey !== key) continue;
      if (message.date <= account.asOf) continue;
      account.estimatedBalance += change;
      if (change > 0) account.capturedIncome += change;
      else account.capturedExpense += Math.abs(change);
      account.capturedChange += change;
      account.capturedTransactionCount++;
      if (message.date > account.estimatedAsOf) account.estimatedAsOf = message.date;
    }
  }

  const subscriptions = deriveSubscriptions(deduplicatedMessages, now);

  recognized.sort((a, b) => b.date - a.date);
  const activity = deduplicatedMessages
    .filter(hasVisibleActivityCategory)
    .sort((a, b) => b.date - a.date);

  const accounts = [...accountsByKey.values()];
  for (const acc of accounts) acc.history.sort((a, b) => b.asOf - a.asOf);

  const banksByKey = new Map<string, BankGroup>();
  for (const account of accounts) {
    const key = normalizeBankName(account.bankName);
    const existing = banksByKey.get(key);
    if (existing) existing.accounts.push(account);
    else {
      banksByKey.set(key, {
        bankName: displayBankName(account.bankName),
        accounts: [account],
        unassignedReadings: [],
      });
    }
  }
  for (const [key, readings] of unassignedReadingsByBank) {
    const bank = banksByKey.get(key) ?? {
      bankName: displayBankName(readings[0]!.detectedBankName),
      accounts: [],
      unassignedReadings: [],
    };
    for (const reading of readings) {
      const candidates = bank.accounts.filter((account) => account.currency === reading.currency);
      if (candidates.length === 1) {
        reading.association = {
          kind: "suggested",
          accountLast4: candidates[0]!.last4,
          reason: "sole-account",
        };
      }
      bank.unassignedReadings.push(reading);
    }
    bank.unassignedReadings.sort((a, b) => b.asOf - a.asOf);
    banksByKey.set(key, bank);
  }
  const banks = [...banksByKey.values()].sort((a, b) => a.bankName.localeCompare(b.bankName));
  for (const bank of banks) {
    bank.accounts.sort((a, b) => b.asOf - a.asOf || a.last4.localeCompare(b.last4));
  }

  const mandates = [...mandatesById.values()].sort((a, b) => b.lastUpdated - a.lastUpdated);
  for (const man of mandates) man.history.sort((a, b) => b.date - a.date);

  const mandatesByMerchantMap = new Map<string, Mandate[]>();
  for (const man of mandates) {
    const group = mandatesByMerchantMap.get(man.merchant);
    if (group) group.push(man);
    else mandatesByMerchantMap.set(man.merchant, [man]);
  }
  const mandatesByMerchant: MerchantMandates[] = [...mandatesByMerchantMap.entries()]
    .map(([merchant, ms]) => ({ merchant, mandates: ms }))
    .sort((a, b) => b.mandates[0]!.lastUpdated - a.mandates[0]!.lastUpdated);

  return {
    accounts,
    banks,
    monthIncomeByCurrency,
    monthExpenseByCurrency,
    subscriptions,
    mandates,
    mandatesByMerchant,
    activity,
    recent: recognized,
  };
}

// A transaction is recurring if it's tied to a tracked UPI mandate (the
// confirmed tier — real UMN evidence) or matches an inferred Subscription
// (the heuristic tier — see subscriptions.ts). Kept as a lookup against the
// already-derived Dashboard rather than a per-message parser field — "is
// this part of a recurring series" is a cross-message dashboard-level fact,
// not something a single SMS can know about itself.
export function isRecurringTransaction(item: ParsedSms, dashboard: Dashboard): boolean {
  const { result } = item;
  if (result.mandateId && dashboard.mandates.some((m) => m.mandateId === result.mandateId)) {
    return true;
  }
  return isInferredRecurringTransaction(item, dashboard.subscriptions);
}
