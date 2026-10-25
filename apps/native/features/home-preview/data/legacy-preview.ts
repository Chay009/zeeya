import {
  isRecurringTransaction,
  type AccountBalance,
  type Dashboard,
  type DetectedAccount,
  type Mandate,
  type MandateEvent,
} from "../../../lib/dashboard";
import { formatDate, formatDateTimeFull, formatMoney } from "../../dashboard/utils/format";
import { presentAccount } from "../../dashboard/utils/account-presentation";
import { ACTIVITY_CATEGORY_FILTERS, type ActivityCategoryFilter } from "../../../lib/activity-filters";
import type { ParsedSms } from "../../../lib/sms";
import { subscriptionMonthlyTotals, type Subscription } from "../../../lib/subscriptions";
import { trxDirection, type TrxDirection } from "../../../lib/transaction-direction";
import { minorUnitExponent, toMinorUnits } from "../../../lib/currency";
import { parseDecimalAmount } from "@zeeya/parser/normalize";
import type { DashboardAggregates } from "../../../lib/dashboard-data";
import { titleCase } from "../../../lib/transaction-category";
import { emptyAccountPreview } from "./account-helpers";
import { buildCategoriesFromAggregate } from "./categories";
import { presentFlowChart } from "./flow-chart-scale";
import {
  formatActivityDate,
  formatCapturedChange,
  formatCurrencyTotals,
  formatDateHeading,
  formatMonthLabel,
  formatSignedAmount,
  monthKey,
  sameMonth,
  startOfDay,
  subcategoryLabel,
} from "./format-helpers";
import type {
  ActivityCategorySuggestion,
  ActivityItem,
  CalendarMonth,
  HomeAccount,
  HomeDetectedAccount,
  HomePreviewData,
  HomeUnassignedReading,
  PreviewSub,
} from "./types";
import {
  bankVisualFor,
  merchantName,
  normalized,
  subscriptionVisual,
  visualStyleFor,
} from "./visual";

type FinancialEntry = {
  message: ParsedSms;
  amount: number;
  currency: string;
  direction: Exclude<TrxDirection, "neutral">;
};

function financialEntries(dashboard: Dashboard): FinancialEntry[] {
  return dashboard.recent.flatMap((message) => {
    const amount = parseDecimalAmount(message.result.trx);
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

// Every currency with any real income/expense activity this period —
// what the Cashflow chart/calendar/category views can actually be
// switched between, since each of those only ever renders one currency
// at a time (see HomePreviewData.cashflow's availableCurrencies comment).
function availableCurrencies(dashboard: Dashboard, entries: FinancialEntry[]): string[] {
  const currencies = new Set<string>([
    ...Object.keys(dashboard.monthIncomeByCurrency),
    ...Object.keys(dashboard.monthExpenseByCurrency),
    ...dashboard.accounts.map((account) => account.currency),
    ...entries.map((entry) => entry.currency),
  ]);
  const primary = primaryCurrency(dashboard, entries);
  return [...currencies].sort((left, right) => {
    if (left === primary) return -1;
    if (right === primary) return 1;
    if (left === "INR") return -1;
    if (right === "INR") return 1;
    return left.localeCompare(right);
  });
}

function primaryCurrency(dashboard: Dashboard, entries: FinancialEntry[]): string {
  if (
    dashboard.monthIncomeByCurrency.INR !== undefined ||
    dashboard.monthExpenseByCurrency.INR !== undefined ||
    dashboard.accounts.some((account) => account.currency === "INR") ||
    entries.some((entry) => entry.currency === "INR")
  ) {
    return "INR";
  }
  const account = latestAccount(dashboard.accounts);
  if (account) return account.currency;
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

function accountPreview(
  account: AccountBalance,
  netByCurrency: ReadonlyMap<string, number>,
  visible: boolean,
  unassignedNote: string | null,
): HomeAccount {
  const presentation = presentAccount(account);

  return {
    id: `${account.bankName.trim().replace(/\s+/g, " ").toLowerCase()}|${account.last4}`,
    key: `account:${accountPreviewKey(account)}`,
    bankName: account.bankName,
    bankIcon: bankVisualFor(account.bankName).img,
    bankColor: bankVisualFor(account.bankName).ink,
    status: presentation.status,
    balance: visible ? presentation.balance : "—",
    // The figure `balance` shows (presentAccount's rule), so totals match.
    balanceMinorUnits: (() => {
      if (!visible || account.anchorStatus !== "reported") return null;
      const shown = presentation.hasCapturedTransactions ? account.estimatedBalance : account.balance;
      return shown === null ? null : toMinorUnits(String(shown), account.currency);
    })(),
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
  return presentFlowChart(values);
}

function buildCalendarMonths(
  entries: FinancialEntry[],
  now: Date,
  currency: string,
  visible: boolean,
  monthTotals: DashboardAggregates["monthTotals"],
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
        ? formatMoney(monthTotals.incomeByCurrency[currency] ?? 0, currency)
        : "—"
      : visible
        ? formatMoney(income, currency)
        : "—";
    const expenseLabel = current
      ? visible
        ? formatMoney(monthTotals.expenseByCurrency[currency] ?? 0, currency)
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
      // Transaction category (trxTypeRich — EXPENSE/INCOME/TRANSFER/...)
      // and the UPI/NEFT/IMPS/mandate subcategory both surfaced directly in
      // the row, not just the detail screen — these are the fields that
      // tell you *what kind* of entry this is at a glance.
      ...(message.result.trxTypeRich
        ? [{ key: "type", label: titleCase(message.result.trxTypeRich), tone: "type" as const }]
        : []),
      ...(message.result.subcategory
        ? [
            {
              key: "subcategory",
              label: subcategoryLabel(message.result.subcategory),
              tone: "subcategory" as const,
            },
          ]
        : []),
      ...(message.result.mandateEvent
        ? [
            {
              key: "mandate",
              label:
                message.result.mandateEvent === "active" ? "Mandate active" : "Mandate cancelled",
              tone: "mandate" as const,
            },
          ]
        : []),
      ...(message.result.isFromCard ? [{ key: "card", label: "Card", tone: "card" as const }] : []),
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
      raw: message,
    };
  });

  return { filters, items: allItems.slice(0, 5), allItems };
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
    currency: mandate.currency,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    bar: style.bar,
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
    currency: subscription.currency,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    bar: style.bar,
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

function buildSubscriptions(dashboard: Dashboard, visible: boolean, currency: string) {
  if (!visible) {
    return {
      items: [],
      monthlySpend: "—",
      expectedMonthlyMinorUnits: 0,
      activeCount: 0,
      cancelledCount: 0,
    };
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
    expectedMonthlyMinorUnits: Math.round(
      (totals[currency] ?? 0) * 10 ** minorUnitExponent(currency),
    ),
    monthlySpend: formatCurrencyTotals(totals, items.length > 0),
    activeCount: items.filter((item) => item.status === "Active").length,
    cancelledCount: items.filter((item) => item.status === "Cancelled").length,
  };
}

// LEGACY — builds HomePreviewData from the complete, full-history Dashboard
// (every SMS ever parsed, held in Zustand). Phase 1B.4 sub-slice 4 replaced
// Home's own screen with createHomePreviewDataFromReadModel below, which
// builds the identical HomePreviewData shape from the bounded HomeReadModel
// instead — see that function's own comment. This function stays wired to
// the other screens that still read a full Dashboard today (transaction
// detail, insights screen, etc.) until a later phase migrates them too
// (see Phase 1C's own boundary) — it is not dead code, but no new caller
// should be added here.
export function createHomePreviewData(
  dashboard: Dashboard,
  ready: boolean,
  now = new Date(),
  // When set, scopes the Cashflow chart/calendar/category views to this
  // currency instead of the auto-picked primary one — lets the screen
  // offer a real switcher when more than one currency has activity,
  // rather than always silently defaulting to whichever is "primary."
  selectedCurrency?: string,
  aggregates?: DashboardAggregates | null,
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
  // SQL-backed money values have their own readiness boundary. The rest of
  // the screen can still render real accounts/activity while this source is
  // loading, but it must never substitute dashboard-derived totals for an
  // unavailable aggregate response.
  const hasAggregateData = hasRealData && aggregates !== null;
  const currencies = availableCurrencies(dashboard, entries);
  const currency =
    selectedCurrency && currencies.includes(selectedCurrency)
      ? selectedCurrency
      : primaryCurrency(dashboard, entries);
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
  const monthTotals = aggregates?.monthTotals ?? {
    incomeByCurrency: {},
    expenseByCurrency: {},
  };
  const categories = aggregates?.categoryTotalsByCurrency[currency] ?? [];

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
      income: formatCurrencyTotals(monthTotals.incomeByCurrency, hasAggregateData),
      expense: formatCurrencyTotals(monthTotals.expenseByCurrency, hasAggregateData),
      flowChart: flow,
      calendarMonths: buildCalendarMonths(entries, now, currency, hasAggregateData, monthTotals),
      categories: buildCategoriesFromAggregate(categories, currency),
      availableCurrencies: currencies,
      selectedCurrency: currency,
    },
    budget: {
      monthLabel,
      spent: formatCurrencyTotals(monthTotals.expenseByCurrency, hasAggregateData),
      limit: null,
      usedPercent: null,
      remaining: null,
    },
    subscriptions: buildSubscriptions(dashboard, hasRealData, currency),
    activity: { dateLabel: formatDateHeading(now), ...activity },
  };
}

