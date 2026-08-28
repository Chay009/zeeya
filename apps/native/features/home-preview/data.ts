import {
  isRecurringTransaction,
  type AccountBalance,
  type Dashboard,
  type DetectedAccount,
  type Mandate,
  type MandateEvent,
} from "../../lib/dashboard";
import { formatDate, formatDateTimeFull, formatMoney } from "../dashboard/utils/format";
import { presentAccount } from "../dashboard/utils/account-presentation";
import { ACTIVITY_CATEGORY_FILTERS, type ActivityCategoryFilter } from "../../lib/activity-filters";
import type { ParsedSms } from "../../lib/sms";
import { subscriptionMonthlyTotals, type Subscription } from "../../lib/subscriptions";
import { trxDirection, type TrxDirection } from "../../lib/transaction-direction";

export type PreviewSub = {
  key: string;
  name: string;
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  type: "autopay" | "recurring" | "manual";
  typeLabel: string;
  status: "Active" | "Cancelled";
  amount: string;
  amountValue: number | null;
  meta: string;
  dateLabel: string;
  dateLabelTitle: string;
  reactivated?: boolean;
  timeline: { label: string; time: string; dot: string }[];
};

export type FlowBar = [income: number, expense: number];

export type FlowDay = {
  label: string;
  active: boolean;
};

export type CalendarMonth = {
  key: string;
  label: string;
  spent: string;
  income: string;
  offset: number;
  days: number;
  today?: number;
  nets: Record<number, string>;
};

export type CategorySummary = {
  label: string;
  amount: string;
  color: string;
  pct: number;
};

export type ActivityItem = {
  key: string;
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  bar: string;
  name: string;
  sub: string;
  amount: string | null;
  direction: "income" | "expense" | "neutral";
  categoryFilters: ActivityCategoryFilter[];
  categorySuggestions: ActivityCategorySuggestion[];
  pills: ActivityPill[];
};

export type ActivityCategorySuggestion = {
  key: string;
  label: string;
};

export type ActivityPill = {
  key: string;
  label: string;
  tone: "bank" | "recurring";
};

export type HomeAccount = {
  key: string;
  bankName: string;
  bankIcon?: string;
  status: string;
  balance: string;
  last4: string;
  currency: string;
  netAcross: string;
  balanceMeta: string | null;
  reportedBalance: string | null;
  reportedMeta: string | null;
  capturedIncome: string | null;
  capturedExpense: string | null;
  capturedChange: string | null;
  capturedTransactionCount: number;
  reconciliation: string | null;
  unassignedNote: string | null;
};

export type HomeDetectedAccount = {
  key: string;
  bankName: string;
  bankIcon?: string;
  status: "DETECTED";
  last4: string;
  currency: string;
  evidenceType: string;
  evidenceAt: number;
  evidenceDate: string;
  evidenceSource: string;
  note: string;
};

export type HomeUnassignedReading = {
  key: string;
  bankName: string;
  bankIcon?: string;
  status: "UNASSIGNED";
  balance: string;
  currency: string;
  evidenceAt: number;
  evidenceDate: string;
  evidenceSource: string;
  note: string;
};

export type HomePreviewData = {
  displayName: string;
  greeting: string;
  monthLabel: string;
  account: HomeAccount;
  accounts: HomeAccount[];
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
  cashflow: {
    subtitle: string;
    income: string;
    expense: string;
    flowBars: FlowBar[];
    flowDays: FlowDay[];
    calendarMonths: CalendarMonth[];
    categories: CategorySummary[];
  };
  budget: {
    monthLabel: string;
    spent: string;
    limit: string | null;
    usedPercent: number | null;
    remaining: string | null;
  };
  subscriptions: {
    items: PreviewSub[];
    monthlySpend: string;
    activeCount: number;
    cancelledCount: number;
  };
  activity: {
    dateLabel: string;
    filters: { value: ActivityCategoryFilter; label: string; count: number }[];
    items: ActivityItem[];
    allItems: ActivityItem[];
  };
};

type FinancialEntry = {
  message: ParsedSms;
  amount: number;
  currency: string;
  direction: Exclude<TrxDirection, "neutral">;
};

type VisualStyle = {
  tile: string;
  ink: string;
  bar: string;
  img?: string;
};

const knownBrandStyles: { match: string; style: VisualStyle }[] = [
  {
    match: "netflix",
    style: {
      tile: "#ffe9ea",
      ink: "#e11",
      bar: "#8e61bf",
      img: "https://cdn.simpleicons.org/netflix/E50914",
    },
  },
  {
    match: "amazon",
    style: {
      tile: "#fff0d6",
      ink: "#c76e00",
      bar: "#c76e00",
      img: "https://cdn.simpleicons.org/amazon/FF9900",
    },
  },
  {
    match: "spotify",
    style: {
      tile: "#e0f7e9",
      ink: "#17994a",
      bar: "#2f9d70",
      img: "https://cdn.simpleicons.org/spotify/1DB954",
    },
  },
  {
    match: "youtube",
    style: {
      tile: "#eee4fb",
      ink: "#8e61bf",
      bar: "#8e61bf",
      img: "https://cdn.simpleicons.org/youtube/FF0000",
    },
  },
  {
    match: "disney",
    style: {
      tile: "#f0ede9",
      ink: "#8a8378",
      bar: "#a8a59b",
      img: "https://cdn.simpleicons.org/disneyplus/00C7F0",
    },
  },
  {
    match: "swiggy",
    style: {
      tile: "#fff0bf",
      ink: "#b77f1d",
      bar: "#c76e00",
      img: "https://cdn.simpleicons.org/swiggy/FC8019",
    },
  },
  {
    match: "flipkart",
    style: {
      tile: "#eee4fb",
      ink: "#2874f0",
      bar: "#d05b51",
      img: "https://cdn.simpleicons.org/flipkart/2874F0",
    },
  },
];

const knownBankStyles: { match: string; style: VisualStyle }[] = [
  {
    match: "state bank of india",
    style: {
      tile: "#e8f0ff",
      ink: "#1e5aa8",
      bar: "#1e5aa8",
      img: "https://cdn.simpleicons.org/statebankofindia/1E5AA8",
    },
  },
  {
    match: "kotak",
    style: {
      tile: "#fff0f0",
      ink: "#ed1b2e",
      bar: "#ed1b2e",
      img: "https://cdn.simpleicons.org/kotakmahindrabank/ED1B2E",
    },
  },
  {
    match: "hdfc",
    style: {
      tile: "#e9f0ff",
      ink: "#004c8f",
      bar: "#004c8f",
      img: "https://cdn.simpleicons.org/hdfcbank/004C8F",
    },
  },
  {
    match: "icici",
    style: {
      tile: "#fff0e4",
      ink: "#f58220",
      bar: "#f58220",
      img: "https://cdn.simpleicons.org/icicibank/F58220",
    },
  },
  {
    match: "axis",
    style: {
      tile: "#f8eaf2",
      ink: "#97144d",
      bar: "#97144d",
      img: "https://cdn.simpleicons.org/axisbank/97144D",
    },
  },
  {
    match: "bank of baroda",
    style: {
      tile: "#fff0e4",
      ink: "#f36f21",
      bar: "#f36f21",
      img: "https://cdn.simpleicons.org/bankofbaroda/F36F21",
    },
  },
];

const categoryStyles: { match: string; style: VisualStyle }[] = [
  { match: "food", style: { tile: "#fff0bf", ink: "#b77f1d", bar: "#b77f1d" } },
  { match: "grocer", style: { tile: "#fbe2da", ink: "#c04a3e", bar: "#d77863" } },
  { match: "travel", style: { tile: "#e0f3e6", ink: "#21865e", bar: "#2f9d70" } },
  { match: "house", style: { tile: "#eee4fb", ink: "#8e61bf", bar: "#8e61bf" } },
  { match: "bill", style: { tile: "#e0f3e6", ink: "#21865e", bar: "#2f9d70" } },
];

const fallbackVisualStyle: VisualStyle = {
  tile: "#eef4ef",
  ink: "#527363",
  bar: "#8ba095",
};

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const amount = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function titleCase(value: string): string {
  return value
    .replace(/^GRM_/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function merchantName(message: ParsedSms): string {
  const { result } = message;
  return (
    result.brandName?.trim() ||
    result.vendor?.trim() ||
    result.bene?.trim() ||
    result.bankName?.trim() ||
    message.sender.trim() ||
    "Transaction"
  );
}

function categoryName(message: ParsedSms): string {
  const category = message.result.merchantCategory ?? message.result.subcategory;
  return category ? titleCase(category) : "Transaction";
}

function visualStyleFor(name: string, category?: string | null): VisualStyle {
  const value = normalized(name);
  const knownBrand = knownBrandStyles.find((entry) => value.includes(entry.match));
  if (knownBrand) return knownBrand.style;

  const categoryStyle = categoryStyles.find((entry) =>
    normalized(category ?? "").includes(entry.match),
  );
  return categoryStyle?.style ?? fallbackVisualStyle;
}

function bankVisualFor(name: string): VisualStyle {
  const value = normalized(name);
  return knownBankStyles.find((entry) => value.includes(entry.match))?.style ?? fallbackVisualStyle;
}

function formatCurrencyTotals(record: Record<string, number>, visible: boolean): string {
  if (!visible) return "—";
  const parts = Object.entries(record)
    .sort(([left], [right]) =>
      left === "INR" ? -1 : right === "INR" ? 1 : left.localeCompare(right),
    )
    .map(([currency, amount]) => formatMoney(amount, currency));
  return parts.length > 0 ? parts.join(" + ") : "—";
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function formatActivityDate(timestamp: number): string {
  return `${formatDate(timestamp)} · ${new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase();
}

function formatSignedAmount(amount: number, currency: string): string {
  if (amount > 0) return `+${formatMoney(amount, currency)}`;
  if (amount < 0) return `−${formatMoney(Math.abs(amount), currency)}`;
  return formatMoney(0, currency);
}

function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sameMonth(timestamp: number, date: Date): boolean {
  const value = new Date(timestamp);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth();
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function financialEntries(dashboard: Dashboard): FinancialEntry[] {
  return dashboard.recent.flatMap((message) => {
    const amount = parseAmount(message.result.trx);
    const direction = trxDirection(message.result.trxTypeRich);
    if (amount === null || direction === "neutral") return [];
    return [
      {
        message,
        amount,
        currency: message.result.currency ?? "INR",
        direction,
      },
    ];
  });
}

function primaryCurrency(dashboard: Dashboard, entries: FinancialEntry[]): string {
  const account = latestAccount(dashboard.accounts);
  if (account) return account.currency;
  if (dashboard.monthIncomeByCurrency.INR || dashboard.monthExpenseByCurrency.INR) return "INR";
  return entries[0]?.currency ?? Object.keys(dashboard.monthIncomeByCurrency)[0] ?? "INR";
}

function latestAccount(accounts: AccountBalance[]): AccountBalance | null {
  return accounts.reduce<AccountBalance | null>(
    (latest, account) => (!latest || account.asOf > latest.asOf ? account : latest),
    null,
  );
}

function accountPreviewKey(
  account: Pick<AccountBalance, "bankName" | "last4" | "currency">,
): string {
  return `${normalized(account.bankName)}:${account.last4}:${account.currency}`;
}

function formatCapturedChange(change: number, currency: string): string {
  if (change > 0) return `+${formatMoney(change, currency)}`;
  if (change < 0) return `−${formatMoney(Math.abs(change), currency)}`;
  return formatMoney(0, currency);
}

function accountPreview(
  account: AccountBalance,
  netByCurrency: ReadonlyMap<string, number>,
  visible: boolean,
  unassignedNote: string | null,
): HomeAccount {
  const presentation = presentAccount(account);

  return {
    key: `account:${accountPreviewKey(account)}`,
    bankName: account.bankName,
    bankIcon: bankVisualFor(account.bankName).img,
    status: presentation.status,
    balance: visible ? presentation.balance : "—",
    last4: account.last4,
    currency: account.currency,
    netAcross:
      visible && netByCurrency.has(account.currency)
        ? formatMoney(netByCurrency.get(account.currency)!, account.currency)
        : "—",
    balanceMeta: visible
      ? presentation.hasReportedBalance
        ? `${presentation.hasCapturedTransactions ? "Calculated estimate" : "Bank reported"} as of ${formatDateTimeFull(presentation.asOf)}${presentation.hasCapturedTransactions ? "" : ` · ${account.sender}`}`
        : `Captured change through ${formatDateTimeFull(presentation.asOf)} · awaiting first bank-reported balance`
      : null,
    reportedBalance:
      visible && account.anchorStatus === "reported" && presentation.hasCapturedTransactions
        ? formatMoney(account.balance, account.currency)
        : null,
    reportedMeta:
      visible && account.anchorStatus === "reported" && presentation.hasCapturedTransactions
        ? `${formatDateTimeFull(account.asOf)} · ${account.sender}`
        : null,
    capturedIncome:
      visible && presentation.hasCapturedTransactions
        ? `+${formatMoney(account.capturedIncome, account.currency)}`
        : null,
    capturedExpense:
      visible && presentation.hasCapturedTransactions
        ? `−${formatMoney(account.capturedExpense, account.currency)}`
        : null,
    capturedChange:
      visible && presentation.hasCapturedTransactions
        ? formatCapturedChange(account.capturedChange, account.currency)
        : null,
    capturedTransactionCount: visible ? account.capturedTransactionCount : 0,
    reconciliation:
      visible && account.reconciliationDelta !== null
        ? account.reconciliationDelta === 0
          ? "Last reconciliation matched captured activity"
          : `Last reconciliation: ${formatMoney(Math.abs(account.reconciliationDelta), account.currency)} ${account.reconciliationDelta > 0 ? "higher" : "lower"} than the captured estimate`
        : null,
    unassignedNote,
  };
}

function unassignedPreview(
  bankName: string,
  reading: Dashboard["banks"][number]["unassignedReadings"][number],
  visible: boolean,
): HomeUnassignedReading {
  const note =
    reading.association.kind === "suggested"
      ? `Probably belongs to ••${reading.association.accountLast4} · kept separate because this SMS did not contain account digits`
      : "Account number not found · not included in a confirmed account balance";

  return {
    key: `unassigned:${normalized(bankName)}:${reading.asOf}:${reading.sender}:${reading.balance}`,
    bankName,
    bankIcon: bankVisualFor(bankName).img,
    status: "UNASSIGNED",
    balance: visible ? formatMoney(reading.balance, reading.currency) : "—",
    currency: reading.currency,
    evidenceAt: reading.asOf,
    evidenceDate: visible ? formatDateTimeFull(reading.asOf) : "",
    evidenceSource: visible ? reading.sender : "",
    note: visible ? note : "",
  };
}

function detectedAccountPreview(account: DetectedAccount, visible: boolean): HomeDetectedAccount {
  return {
    key: `detected:${accountPreviewKey(account)}`,
    bankName: account.bankName,
    bankIcon: bankVisualFor(account.bankName).img,
    status: "DETECTED",
    last4: account.last4,
    currency: account.currency,
    evidenceType: "Account identity from bank SMS",
    evidenceAt: account.asOf,
    evidenceDate: visible ? formatDateTimeFull(account.asOf) : "",
    evidenceSource: visible ? account.sender : "",
    note: visible ? "No bank-reported balance has been found for this account yet" : "",
  };
}

function emptyAccountPreview(currency: string): HomeAccount {
  return {
    key: "account:empty",
    bankName: "No account connected",
    status: "—",
    balance: "—",
    last4: "—",
    currency,
    netAcross: "—",
    balanceMeta: null,
    reportedBalance: null,
    reportedMeta: null,
    capturedIncome: null,
    capturedExpense: null,
    capturedChange: null,
    capturedTransactionCount: 0,
    reconciliation: null,
    unassignedNote: null,
  };
}

function buildAccountPreviews(
  dashboard: Dashboard,
  visible: boolean,
): {
  accounts: HomeAccount[];
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
} {
  const confirmed = new Map<string, AccountBalance>();
  for (const account of dashboard.accounts) confirmed.set(accountPreviewKey(account), account);
  for (const bank of dashboard.banks) {
    for (const account of bank.accounts) confirmed.set(accountPreviewKey(account), account);
  }

  const netByCurrency = new Map<string, number>();
  for (const account of confirmed.values()) {
    if (account.anchorStatus === "unreported") continue;
    netByCurrency.set(
      account.currency,
      (netByCurrency.get(account.currency) ?? 0) + account.estimatedBalance,
    );
  }

  const accountPreviews = [...confirmed.values()].map((account) => {
    const bank = dashboard.banks.find(
      (candidate) => normalized(candidate.bankName) === normalized(account.bankName),
    );
    const newerSuggested = bank?.unassignedReadings.find(
      (reading) =>
        reading.asOf > account.asOf &&
        reading.association.kind === "suggested" &&
        reading.association.accountLast4 === account.last4,
    );
    const note = newerSuggested
      ? "A newer account-unidentified bank reading is kept separate until the account identity is confirmed"
      : null;
    return {
      preview: accountPreview(account, netByCurrency, visible, note),
      updatedAt: Math.max(account.asOf, account.estimatedAsOf),
    };
  });

  const detectedAccounts = dashboard.detectedAccounts
    .filter((account) => !confirmed.has(accountPreviewKey(account)))
    .map((account) => detectedAccountPreview(account, visible))
    .sort((left, right) => right.evidenceAt - left.evidenceAt);

  const unassignedReadings = dashboard.banks
    .map((bank) => {
      const latestUnassigned = bank.unassignedReadings[0];
      return latestUnassigned ? unassignedPreview(bank.bankName, latestUnassigned, visible) : null;
    })
    .filter((reading): reading is HomeUnassignedReading => reading !== null)
    .sort((left, right) => right.evidenceAt - left.evidenceAt);

  accountPreviews.sort((left, right) => right.updatedAt - left.updatedAt);
  return {
    accounts: accountPreviews.map(({ preview }) => preview),
    detectedAccounts,
    unassignedReadings,
  };
}

function buildFlow(entries: FinancialEntry[], now: Date, currency: string) {
  const today = startOfDay(now);
  const values = Array.from({ length: 7 }, (_, index) => {
    const dayStart = today - (6 - index) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const dayEntries = entries.filter(
      (entry) =>
        entry.currency === currency &&
        entry.message.date >= dayStart &&
        entry.message.date < dayEnd,
    );
    return {
      income: dayEntries
        .filter((entry) => entry.direction === "income")
        .reduce((total, entry) => total + entry.amount, 0),
      expense: dayEntries
        .filter((entry) => entry.direction === "expense")
        .reduce((total, entry) => total + entry.amount, 0),
      active: dayStart === today,
      label: new Date(dayStart).toLocaleDateString("en-IN", { weekday: "short" }),
    };
  });
  const max = Math.max(...values.flatMap((value) => [value.income, value.expense]), 0);
  const height = (value: number) => (max === 0 ? 0 : Math.max(8, Math.round((value / max) * 103)));

  return {
    flowBars: values.map((value) => [height(value.income), height(value.expense)] as FlowBar),
    flowDays: values.map(({ label, active }) => ({ label, active })),
  };
}

function buildCalendarMonths(
  dashboard: Dashboard,
  entries: FinancialEntry[],
  now: Date,
  currency: string,
  visible: boolean,
): CalendarMonth[] {
  const keys = new Set(
    entries
      .filter((entry) => entry.currency === currency)
      .map((entry) => monthKey(entry.message.date)),
  );
  keys.add(monthKey(now.getTime()));

  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const oldestMonth = [...keys]
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      return new Date(year!, month! - 1, 1);
    })
    .reduce(
      (earliest, date) => (date.getTime() < earliest.getTime() ? date : earliest),
      currentMonth,
    );
  const calendarKeys: string[] = [];
  for (
    let monthDate = currentMonth;
    monthDate.getTime() >= oldestMonth.getTime();
    monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  ) {
    calendarKeys.push(monthKey(monthDate.getTime()));
  }

  return calendarKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const monthDate = new Date(year!, month! - 1, 1);
    const monthEntries = entries.filter(
      (entry) => entry.currency === currency && sameMonth(entry.message.date, monthDate),
    );
    const income = monthEntries
      .filter((entry) => entry.direction === "income")
      .reduce((total, entry) => total + entry.amount, 0);
    const expense = monthEntries
      .filter((entry) => entry.direction === "expense")
      .reduce((total, entry) => total + entry.amount, 0);
    const nets: Record<number, number> = {};
    for (const entry of monthEntries) {
      const day = new Date(entry.message.date).getDate();
      nets[day] = (nets[day] ?? 0) + (entry.direction === "income" ? entry.amount : -entry.amount);
    }
    const offset = (monthDate.getDay() + 6) % 7;
    const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const current = sameMonth(monthDate.getTime(), now);
    const incomeLabel = current
      ? visible
        ? formatMoney(dashboard.monthIncomeByCurrency[currency] ?? 0, currency)
        : "—"
      : visible
        ? formatMoney(income, currency)
        : "—";
    const expenseLabel = current
      ? visible
        ? formatMoney(dashboard.monthExpenseByCurrency[currency] ?? 0, currency)
        : "—"
      : visible
        ? formatMoney(expense, currency)
        : "—";

    return {
      key,
      label: formatMonthLabel(monthDate),
      spent: expenseLabel,
      income: incomeLabel,
      offset,
      days,
      today: current ? now.getDate() : undefined,
      nets: Object.fromEntries(
        Object.entries(nets).map(([day, amount]) => [day, formatSignedAmount(amount, currency)]),
      ),
    };
  });
}

function buildCategories(
  entries: FinancialEntry[],
  now: Date,
  currency: string,
): CategorySummary[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (
      entry.currency !== currency ||
      entry.direction !== "expense" ||
      !sameMonth(entry.message.date, now)
    ) {
      continue;
    }
    const label = categoryName(entry.message);
    totals.set(label, (totals.get(label) ?? 0) + entry.amount);
  }
  const max = Math.max(...totals.values(), 0);
  return [...totals.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([label, amount]) => {
      const style = visualStyleFor(label, label);
      return {
        label,
        amount: formatMoney(amount, currency),
        color: style.bar,
        pct: max === 0 ? 0 : Math.round((amount / max) * 100),
      };
    });
}

function activityCategoryFilters(message: ParsedSms): ActivityCategoryFilter[] {
  return ACTIVITY_CATEGORY_FILTERS.flatMap((option) => {
    if (option.value === "all") return [];
    return message.result.matchedCategories?.includes(option.value) ? [option.value] : [];
  });
}

function activityCategorySuggestions(message: ParsedSms): ActivityCategorySuggestion[] {
  const candidates = new Map<string, ActivityCategorySuggestion>();
  const addCandidate = (key: string, label: string) => {
    const normalizedLabel = normalized(label);
    if (!normalizedLabel || normalizedLabel === "transaction") return;
    if (!candidates.has(normalizedLabel)) candidates.set(normalizedLabel, { key, label });
  };

  const merchantCategory = message.result.merchantCategory?.trim();
  if (merchantCategory) {
    addCandidate(`merchant:${normalized(merchantCategory)}`, titleCase(merchantCategory));
  }

  const matchedCategories =
    message.result.matchedCategories ??
    message.result.categoryMatches?.map((match) => match.category) ??
    [];
  for (const category of matchedCategories) {
    // These describe the SMS transport or a non-payment message, not what a
    // transaction was for. They must not become spending category chips.
    if (category === "GRM_BANK" || category === "GRM_NOTIF" || category === "GRM_OTP") continue;

    const label =
      ACTIVITY_CATEGORY_FILTERS.find((option) => option.value === category)?.label ??
      titleCase(category);
    addCandidate(`matched:${category}`, label);
  }

  return [...candidates.values()].slice(0, 3);
}

function recentActivityMessages(dashboard: Dashboard): ParsedSms[] {
  const byId = new Map<string, ParsedSms>();
  for (const message of [...dashboard.activity, ...dashboard.recent]) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => right.date - left.date);
}

function buildActivity(dashboard: Dashboard): {
  filters: { value: ActivityCategoryFilter; label: string; count: number }[];
  items: ActivityItem[];
  allItems: ActivityItem[];
} {
  const entriesById = new Map(
    financialEntries(dashboard).map((entry) => [entry.message.id, entry]),
  );
  const messages = recentActivityMessages(dashboard);
  const filters = ACTIVITY_CATEGORY_FILTERS.map((option) => ({
    ...option,
    count:
      option.value === "all"
        ? messages.length
        : messages.filter((message) => activityCategoryFilters(message).includes(option.value))
            .length,
  }));

  const allItems: ActivityItem[] = messages.map((message) => {
    const name = merchantName(message);
    const style = visualStyleFor(name, message.result.merchantCategory);
    const entry = entriesById.get(message.id);
    const categoryFilters = activityCategoryFilters(message);
    const categorySuggestions = entry ? activityCategorySuggestions(message) : [];
    const recurring = entry ? isRecurringTransaction(message, dashboard) : false;
    const pills = [
      ...(message.result.bankName
        ? [{ key: "bank", label: message.result.bankName, tone: "bank" as const }]
        : []),
      ...(recurring ? [{ key: "recurring", label: "Recurring", tone: "recurring" as const }] : []),
    ];

    return {
      key: `activity:${message.id}`,
      letter: name.charAt(0).toUpperCase() || "?",
      tile: style.tile,
      ink: style.ink,
      img: style.img,
      bar: style.bar,
      name,
      sub: formatActivityDate(message.date),
      amount: entry
        ? formatSignedAmount(
            entry.direction === "income" ? entry.amount : -entry.amount,
            entry.currency,
          )
        : null,
      direction: entry?.direction ?? "neutral",
      categoryFilters,
      categorySuggestions,
      pills,
    };
  });

  return { filters, items: allItems.slice(0, 5), allItems };
}

function subscriptionVisual(name: string): VisualStyle {
  return visualStyleFor(name, "subscriptions");
}

function timelineForMandate(history: MandateEvent[]) {
  return history.map((event) => ({
    label: event.status === "cancelled" ? "Cancelled" : "Active",
    time: formatDateTimeFull(event.date),
    dot: event.status === "cancelled" ? "#a8a59b" : "#2f9d70",
  }));
}

function previewFromMandate(mandate: Mandate): PreviewSub {
  const name = mandate.merchant;
  const style = subscriptionVisual(name);
  const amount = mandate.amount === null ? "—" : formatMoney(mandate.amount, mandate.currency);
  const dateLabel = `Updated ${formatDate(mandate.lastUpdated)}`;
  return {
    key: `mandate:${mandate.mandateId}`,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    img: style.img,
    type: "autopay",
    typeLabel: "Autopay",
    status: mandate.status === "cancelled" ? "Cancelled" : "Active",
    amount,
    amountValue: mandate.amount,
    meta: `${name} · ${amount} · ${dateLabel}`,
    dateLabel,
    dateLabelTitle: "LAST UPDATED",
    reactivated:
      mandate.status === "active" && mandate.history.some((event) => event.status === "cancelled"),
    timeline: timelineForMandate(mandate.history),
  };
}

function previewFromSubscription(subscription: Subscription): PreviewSub {
  const name = subscription.merchant;
  const style = subscriptionVisual(name);
  const amount = formatMoney(subscription.amount, subscription.currency);
  const dateLabel = `Last seen ${formatDate(subscription.lastDate)}`;
  return {
    key: `subscription:${normalized(name)}:${subscription.currency}`,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    img: style.img,
    type: "recurring",
    typeLabel: subscription.confidence === "likely" ? "Recurring" : "Possible recurring",
    status: "Active",
    amount,
    amountValue: subscription.amount,
    meta: `${name} · ${amount} · ${dateLabel}`,
    dateLabel,
    dateLabelTitle: "LAST SEEN",
    timeline: [
      {
        label: `${subscription.count} recurring charge${subscription.count === 1 ? "" : "s"} observed`,
        time: formatDateTimeFull(subscription.lastDate),
        dot: "#2f9d70",
      },
    ],
  };
}

function buildSubscriptions(dashboard: Dashboard, visible: boolean) {
  if (!visible) {
    return { items: [], monthlySpend: "—", activeCount: 0, cancelledCount: 0 };
  }

  const items = [
    ...dashboard.mandates.map(previewFromMandate),
    ...dashboard.subscriptions.map(previewFromSubscription),
  ].sort((left, right) => right.key.localeCompare(left.key));

  const totals = { ...subscriptionMonthlyTotals(dashboard.subscriptions) };
  for (const mandate of dashboard.mandates) {
    if (mandate.status !== "active" || mandate.amount === null) continue;
    totals[mandate.currency] = (totals[mandate.currency] ?? 0) + mandate.amount;
  }

  return {
    items,
    monthlySpend: formatCurrencyTotals(totals, items.length > 0),
    activeCount: items.filter((item) => item.status === "Active").length,
    cancelledCount: items.filter((item) => item.status === "Cancelled").length,
  };
}

export function createHomePreviewData(
  dashboard: Dashboard,
  ready: boolean,
  now = new Date(),
): HomePreviewData {
  const entries = financialEntries(dashboard);
  const hasRealData =
    ready &&
    (dashboard.accounts.length > 0 ||
      dashboard.detectedAccounts.length > 0 ||
      dashboard.banks.length > 0 ||
      entries.length > 0 ||
      dashboard.activity.length > 0 ||
      dashboard.recent.length > 0 ||
      dashboard.mandates.length > 0 ||
      dashboard.subscriptions.length > 0);
  const currency = primaryCurrency(dashboard, entries);
  const accountCollections = buildAccountPreviews(dashboard, hasRealData);
  const account = accountCollections.accounts[0] ?? emptyAccountPreview(currency);
  const flow = buildFlow(entries, now, currency);
  const monthLabel = formatMonthLabel(now);
  const activity = hasRealData
    ? buildActivity(dashboard)
    : {
        filters: ACTIVITY_CATEGORY_FILTERS.map((option) => ({ ...option, count: 0 })),
        items: [],
        allItems: [],
      };

  return {
    displayName: "Your account",
    greeting:
      now.getHours() < 12
        ? "Good morning"
        : now.getHours() < 18
          ? "Good afternoon"
          : "Good evening",
    monthLabel,
    account,
    accounts: accountCollections.accounts,
    detectedAccounts: accountCollections.detectedAccounts,
    unassignedReadings: accountCollections.unassignedReadings,
    cashflow: {
      subtitle: `${monthLabel} actuals`,
      income: formatCurrencyTotals(dashboard.monthIncomeByCurrency, hasRealData),
      expense: formatCurrencyTotals(dashboard.monthExpenseByCurrency, hasRealData),
      flowBars: flow.flowBars,
      flowDays: flow.flowDays,
      calendarMonths: buildCalendarMonths(dashboard, entries, now, currency, hasRealData),
      categories: buildCategories(entries, now, currency),
    },
    budget: {
      monthLabel,
      spent: formatCurrencyTotals(dashboard.monthExpenseByCurrency, hasRealData),
      limit: null,
      usedPercent: null,
      remaining: null,
    },
    subscriptions: buildSubscriptions(dashboard, hasRealData),
    activity: { dateLabel: formatDateHeading(now), ...activity },
  };
}
