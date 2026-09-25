import { formatDate, formatDateTimeFull, formatMoney } from "../../dashboard/utils/format";
import { presentAccountSummary } from "../../dashboard/utils/account-presentation";
import { ACTIVITY_CATEGORY_FILTERS, type ActivityCategoryFilter } from "../../../lib/activity-filters";
import { fromMinorUnits } from "../../../lib/currency";
import type {
  CategoryTotal,
  HomeActivityItem,
  HomeReadModel,
  HomeSubscriptionPreviewItem,
  MandateEventSummary,
  MandateSummary,
  SubscriptionSummary,
} from "../../../lib/dashboard-data";
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
  CalendarMonth,
  CategorySummary,
  HomeAccount,
  HomeActivityViewItem,
  HomeDetectedAccount,
  HomePreviewDataFromReadModel,
  HomeUnassignedReading,
  PreviewSub,
} from "./types";
import {
  bankVisualFor,
  normalized,
  subscriptionVisual,
  visualStyleFor,
} from "./visual";

// Same fallback chain as merchantName() above (brandName -> vendor -> bene
// -> bankName -> sender), applied to HomeActivityItem's own fields instead
// of a full ParsedSms's result object — the two must stay in lockstep since
// they're presenting the same underlying rule.
function homeActivityMerchantName(item: HomeActivityItem): string {
  return (
    item.brandName?.trim() ||
    item.vendor?.trim() ||
    item.bene?.trim() ||
    item.bankName?.trim() ||
    item.sender.trim() ||
    "Transaction"
  );
}

// Same rule as activityCategorySuggestions() above, applied to
// HomeActivityItem's own merchantCategory/categories fields instead of a
// full ParsedSms's matchedCategories/categoryMatches — HomeActivityItem's
// own comment confirms categorySuggestions is meant to be computed from
// exactly these fields, not separately queried per row.
function homeActivityCategorySuggestions(item: HomeActivityItem): ActivityCategorySuggestion[] {
  const candidates = new Map<string, ActivityCategorySuggestion>();
  const addCandidate = (key: string, label: string) => {
    const normalizedLabel = normalized(label);
    if (!normalizedLabel || normalizedLabel === "transaction") return;
    if (!candidates.has(normalizedLabel)) candidates.set(normalizedLabel, { key, label });
  };

  const merchantCategory = item.merchantCategory?.trim();
  if (merchantCategory) {
    addCandidate(`merchant:${normalized(merchantCategory)}`, titleCase(merchantCategory));
  }

  for (const category of item.categories) {
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

export function homeActivityViewItem(item: HomeActivityItem): HomeActivityViewItem {
  const name = homeActivityMerchantName(item);
  const style = visualStyleFor(name, item.merchantCategory);
  const pills = [
    ...(item.trxTypeRich
      ? [{ key: "type", label: titleCase(item.trxTypeRich), tone: "type" as const }]
      : []),
    ...(item.subcategory
      ? [
          {
            key: "subcategory",
            label: subcategoryLabel(item.subcategory),
            tone: "subcategory" as const,
          },
        ]
      : []),
    ...(item.mandateEvent
      ? [
          {
            key: "mandate",
            label: item.mandateEvent === "active" ? "Mandate active" : "Mandate cancelled",
            tone: "mandate" as const,
          },
        ]
      : []),
    ...(item.isFromCard ? [{ key: "card", label: "Card", tone: "card" as const }] : []),
    ...(item.bankName ? [{ key: "bank", label: item.bankName, tone: "bank" as const }] : []),
    ...(item.isRecurring
      ? [{ key: "recurring", label: "Recurring", tone: "recurring" as const }]
      : []),
  ];

  // Mirrors financialEntries()'s own rule exactly: a "neutral"-direction
  // message never becomes a FinancialEntry at all on the legacy path, so
  // its activity row always renders amount: null there — never a signed
  // figure. Handling all three directions explicitly here (rather than
  // treating "not income" as "expense") keeps that same rule true for the
  // read-model path instead of silently rendering a neutral transaction as
  // a negative expense amount.
  const amount =
    item.amountMinorUnits === null || item.currency === null || item.direction === "neutral"
      ? null
      : formatSignedAmount(
          (item.direction === "income" ? 1 : -1) *
            fromMinorUnits(item.amountMinorUnits, item.currency),
          item.currency,
        );

  return {
    key: `activity:${item.smsId}`,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    img: style.img,
    bar: style.bar,
    name,
    sub: formatActivityDate(item.date),
    amount,
    direction: item.direction ?? "neutral",
    categoryFilters: item.categories,
    categorySuggestions: homeActivityCategorySuggestions(item),
    pills,
    detailTarget: item.detailTarget,
    date: item.date,
    amountMinorUnits: item.amountMinorUnits,
    currency: item.currency,
    bankName: item.bankName,
    accountId: item.accountId,
  };
}

function homeAccountPreview(
  account: HomeReadModel["accounts"][number],
  netByCurrency: ReadonlyMap<string, number>,
  visible: boolean,
): HomeAccount {
  const presentation = presentAccountSummary(account);
  const currency = account.currency;
  const reconciliationDelta =
    account.reconciliationDeltaMinorUnits === null
      ? null
      : fromMinorUnits(account.reconciliationDeltaMinorUnits, currency);
  const capturedIncome = fromMinorUnits(account.capturedIncomeMinorUnits, currency);
  const capturedExpense = fromMinorUnits(account.capturedExpenseMinorUnits, currency);
  const capturedChange = fromMinorUnits(account.capturedChangeMinorUnits, currency);
  const hasCapturedTransactions = account.capturedTransactionCount > 0;

  return {
    id: account.id,
    key: `account:${normalized(account.bankName)}:${account.last4}:${currency}`,
    bankName: account.bankName,
    bankIcon: bankVisualFor(account.bankName).img,
    bankColor: bankVisualFor(account.bankName).ink,
    status: presentation.status,
    balance: visible ? presentation.balance : "—",
    balanceMinorUnits:
      account.balanceMinorUnits ?? account.estimatedBalanceMinorUnits ?? null,
    last4: account.last4,
    currency,
    netAcross:
      visible && netByCurrency.has(currency)
        ? formatMoney(netByCurrency.get(currency)!, currency)
        : "—",
    balanceMeta: visible
      ? presentation.hasReportedBalance
        ? `${hasCapturedTransactions ? "Calculated estimate" : "Bank reported"} as of ${formatDateTimeFull(presentation.asOf)}${hasCapturedTransactions ? "" : ` · ${account.balanceSender}`}`
        : `Captured change through ${formatDateTimeFull(presentation.asOf)} · awaiting first bank-reported balance`
      : null,
    reportedBalance:
      visible && account.anchorStatus === "reported" && hasCapturedTransactions
        ? formatMoney(fromMinorUnits(account.balanceMinorUnits ?? 0, currency), currency)
        : null,
    reportedMeta:
      visible && account.anchorStatus === "reported" && hasCapturedTransactions
        ? `${formatDateTimeFull(account.balanceAsOf)} · ${account.balanceSender}`
        : null,
    capturedIncome:
      visible && hasCapturedTransactions ? `+${formatMoney(capturedIncome, currency)}` : null,
    capturedExpense:
      visible && hasCapturedTransactions ? `−${formatMoney(capturedExpense, currency)}` : null,
    capturedChange:
      visible && hasCapturedTransactions ? formatCapturedChange(capturedChange, currency) : null,
    capturedTransactionCount: visible ? account.capturedTransactionCount : 0,
    reconciliation:
      visible && reconciliationDelta !== null
        ? reconciliationDelta === 0
          ? "Last reconciliation matched captured activity"
          : `Last reconciliation: ${formatMoney(Math.abs(reconciliationDelta), currency)} ${reconciliationDelta > 0 ? "higher" : "lower"} than the captured estimate`
        : null,
    unassignedNote:
      visible && account.hasNewerSuggestedReading
        ? "A newer account-unidentified bank reading is kept separate until the account identity is confirmed"
        : null,
  };
}

function homeDetectedAccountPreview(
  account: HomeReadModel["detectedAccounts"][number],
  visible: boolean,
): HomeDetectedAccount {
  return {
    key: `detected:${normalized(account.bankName)}:${account.last4}:${account.currency}`,
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

// HomeUnassignedReadingSummary is already the single latest reading per
// bank (see its own comment in lib/dashboard-data.ts) — no per-bank
// grouping/sole-candidate resolution needed here, unlike the legacy
// unassignedPreview, since SQL already did that work.
function homeUnassignedPreview(
  reading: HomeReadModel["unassignedReadings"][number],
  visible: boolean,
): HomeUnassignedReading {
  const note =
    reading.associationKind === "suggested"
      ? "Probably belongs to a confirmed account · kept separate because this SMS did not contain account digits"
      : "Account number not found · not included in a confirmed account balance";

  return {
    key: `unassigned:${normalized(reading.bankName)}:${reading.asOf}:${reading.sender}:${reading.balanceMinorUnits}`,
    bankName: reading.bankName,
    bankIcon: bankVisualFor(reading.bankName).img,
    status: "UNASSIGNED",
    balance: visible
      ? formatMoney(fromMinorUnits(reading.balanceMinorUnits, reading.currency), reading.currency)
      : "—",
    currency: reading.currency,
    evidenceAt: reading.asOf,
    evidenceDate: visible ? formatDateTimeFull(reading.asOf) : "",
    evidenceSource: visible ? reading.sender : "",
    note: visible ? note : "",
  };
}

function buildHomeAccountPreviews(
  model: HomeReadModel,
  visible: boolean,
): {
  accounts: HomeAccount[];
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
} {
  const netByCurrency = new Map<string, number>();
  for (const account of model.accounts) {
    if (account.anchorStatus === "unreported" || account.estimatedBalanceMinorUnits === null) {
      continue;
    }
    const amount = fromMinorUnits(account.estimatedBalanceMinorUnits, account.currency);
    netByCurrency.set(account.currency, (netByCurrency.get(account.currency) ?? 0) + amount);
  }

  // model.accounts already arrives ordered by SQL's own
  // ORDER BY MAX(balance_as_of, estimated_as_of) DESC, id ASC (see
  // queryHomeAccounts's own comment) — never re-sorted here. Re-deriving
  // "most recently updated" a second time in JS would risk silently
  // disagreeing with the query's own ordering the moment either side
  // changed independently.
  const accountPreviews = model.accounts.map((account) => ({
    preview: homeAccountPreview(account, netByCurrency, visible),
  }));

  const detectedAccounts = model.detectedAccounts
    .map((account) => homeDetectedAccountPreview(account, visible))
    .sort((left, right) => right.evidenceAt - left.evidenceAt);

  const unassignedReadings = model.unassignedReadings
    .map((reading) => homeUnassignedPreview(reading, visible))
    .sort((left, right) => right.evidenceAt - left.evidenceAt);

  return {
    accounts: accountPreviews.map(({ preview }) => preview),
    detectedAccounts,
    unassignedReadings,
  };
}

export function presentHomeFlowDays(
  flowDays: HomeReadModel["flowDays"],
  currency: string,
  now: Date,
) {
  const today = startOfDay(now);
  const values = flowDays.map((flowDay) => ({
    income: fromMinorUnits(flowDay.incomeMinorUnits, currency),
    expense: fromMinorUnits(flowDay.expenseMinorUnits, currency),
    active: flowDay.day === today,
    label: new Date(flowDay.day).toLocaleDateString("en-IN", { weekday: "short" }),
  }));

  return presentFlowChart(values);
}

function homeFlow(model: HomeReadModel, now: Date, currency: string) {
  return presentHomeFlowDays(model.flowDays, currency, now);
}

export function presentHomeCalendarMonths(
  months: HomeReadModel["calendarMonths"]["items"],
  now: Date,
  currency: string,
  visible: boolean,
): CalendarMonth[] {
  return months.map((month) => {
    const monthDate = new Date(month.monthStart);
    const key = monthKey(month.monthStart);
    const nets: Record<number, number> = {};
    for (const day of month.days) {
      const dayOfMonth = new Date(day.day).getDate();
      nets[dayOfMonth] = fromMinorUnits(day.incomeMinorUnits - day.expenseMinorUnits, currency);
    }
    const offset = (monthDate.getDay() + 6) % 7;
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const current = sameMonth(month.monthStart, now);

    return {
      key,
      label: formatMonthLabel(monthDate),
      spent: visible
        ? formatMoney(fromMinorUnits(month.expenseMinorUnits, currency), currency)
        : "—",
      income: visible
        ? formatMoney(fromMinorUnits(month.incomeMinorUnits, currency), currency)
        : "—",
      offset,
      days: daysInMonth,
      today: current ? now.getDate() : undefined,
      nets: Object.fromEntries(
        Object.entries(nets).map(([day, amount]) => [day, formatSignedAmount(amount, currency)]),
      ),
    };
  });
}

export function presentHomeCategories(
  rows: CategoryTotal[],
  currency: string,
): CategorySummary[] {
  return buildCategoriesFromAggregate(rows, currency);
}

function homeCategoriesFromAggregate(rows: CategoryTotal[], currency: string): CategorySummary[] {
  return presentHomeCategories(rows, currency);
}

function homeCalendarMonths(
  model: HomeReadModel,
  now: Date,
  currency: string,
  visible: boolean,
): CalendarMonth[] {
  return presentHomeCalendarMonths(model.calendarMonths.items, now, currency, visible);
}

function homePreviewSubFromMandatePreview(
  item: HomeSubscriptionPreviewItem & { kind: "mandate" },
): PreviewSub {
  const name = item.merchant;
  const style = subscriptionVisual(name);
  const amount =
    item.amountMinorUnits === null
      ? "—"
      : formatMoney(fromMinorUnits(item.amountMinorUnits, item.currency), item.currency);
  const dateLabel = `Updated ${formatDate(item.lastUpdated)}`;
  return {
    key: `mandate:${item.mandateId}`,
    currency: item.currency,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    bar: style.bar,
    img: style.img,
    type: "autopay",
    typeLabel: "Autopay",
    status: item.status === "cancelled" ? "Cancelled" : "Active",
    amount,
    amountValue:
      item.amountMinorUnits === null ? null : fromMinorUnits(item.amountMinorUnits, item.currency),
    meta: `${name} · ${amount} · ${dateLabel}`,
    dateLabel,
    dateLabelTitle: "LAST UPDATED",
    reactivated: item.reactivated,
    timeline: item.recentEvents.map((event) => ({
      label: event.status === "cancelled" ? "Cancelled" : "Active",
      time: formatDateTimeFull(event.date),
      dot: event.status === "cancelled" ? "#a8a59b" : "#2f9d70",
    })),
  };
}

export function subscriptionPreviewKey(merchant: string, currency: string): string {
  return `subscription:${normalized(merchant)}:${currency}`;
}

export function previewSubFromSubscriptionSummary(item: SubscriptionSummary): PreviewSub {
  return homePreviewSubFromSubscriptionPreview({ kind: "subscription", ...item });
}

export function previewSubFromMandateSummary(
  item: MandateSummary,
  recentEvents: MandateEventSummary[],
  reactivated: boolean,
): PreviewSub {
  return homePreviewSubFromMandatePreview({
    kind: "mandate",
    ...item,
    recentEvents,
    reactivated,
  });
}

function homePreviewSubFromSubscriptionPreview(
  item: HomeSubscriptionPreviewItem & { kind: "subscription" },
): PreviewSub {
  const name = item.merchant;
  const style = subscriptionVisual(name);
  const amountValue = fromMinorUnits(item.amountMinorUnits, item.currency);
  const amount = formatMoney(amountValue, item.currency);
  const dateLabel = `Last seen ${formatDate(item.lastDate)}`;
  return {
    key: `subscription:${normalized(name)}:${item.currency}`,
    currency: item.currency,
    name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    bar: style.bar,
    img: style.img,
    type: "recurring",
    typeLabel: item.confidence === "likely" ? "Recurring" : "Possible recurring",
    status: "Active",
    amount,
    amountValue,
    meta: `${name} · ${amount} · ${dateLabel}`,
    dateLabel,
    dateLabelTitle: "LAST SEEN",
    timeline: [
      {
        label: `${item.count} recurring charge${item.count === 1 ? "" : "s"} observed`,
        time: formatDateTimeFull(item.lastDate),
        dot: "#2f9d70",
      },
    ],
  };
}

// SQL already produced HomeSubscriptionOverview.items in the correct
// recency-based, cross-source-tie-resolved preview order (see
// db/queries-home.ts's mergePreviewCandidatesByRecency) — this only maps
// each discriminated item to its PreviewSub card shape, never re-sorts.
function homeSubscriptions(model: HomeReadModel, visible: boolean, currency: string) {
  if (!visible) {
    return {
      items: [],
      monthlySpend: "—",
      expectedMonthlyMinorUnits: 0,
      activeCount: 0,
      cancelledCount: 0,
    };
  }
  const overview = model.subscriptionOverview;
  const items = overview.items.map((item) =>
    item.kind === "mandate"
      ? homePreviewSubFromMandatePreview(item)
      : homePreviewSubFromSubscriptionPreview(item),
  );

  return {
    items,
    // totalsByCurrency/activeCount/cancelledCount are already whole-table
    // SQL aggregates (see HomeSubscriptionOverview's own comment) — never
    // recomputed here from the capped `items` above, which would silently
    // under-report once either table exceeds the preview cap.
    expectedMonthlyMinorUnits: overview.totalsByCurrency[currency] ?? 0,
    monthlySpend: formatCurrencyTotals(
      Object.fromEntries(
        Object.entries(overview.totalsByCurrency).map(([currency, minorUnits]) => [
          currency,
          fromMinorUnits(minorUnits, currency),
        ]),
      ),
      overview.activeCount + overview.cancelledCount > 0,
    ),
    activeCount: overview.activeCount,
    cancelledCount: overview.cancelledCount,
  };
}

export function buildHomeActivityFilters(
  categoryCounts: HomeReadModel["activityCategoryCounts"],
  totalActivityCount: number,
) {
  const countsByCategory = new Map(categoryCounts.map((row) => [row.category, row.count]));
  return ACTIVITY_CATEGORY_FILTERS.map((option) => ({
    ...option,
    count:
      option.value === "all" ? totalActivityCount : (countsByCategory.get(option.value) ?? 0),
  }));
}

function homeActivity(model: HomeReadModel): {
  filters: { value: ActivityCategoryFilter; label: string; count: number }[];
  items: HomeActivityViewItem[];
  allItems: HomeActivityViewItem[];
} {
  const filters = buildHomeActivityFilters(
    model.activityCategoryCounts,
    model.totalActivityCount,
  );

  // model.recentActivity is already the bounded, unfiltered ("all" pill)
  // preview SQL produced (see HomeReadModel.recentActivity's own comment) —
  // both `items` and `allItems` below present that same bounded set.
  // Selecting a different filter pill issues a separate
  // home.loadRecentActivity({ category }) call (see
  // HomeRecentActivityQuery's own comment) rather than filtering this array
  // further in JS.
  const items = model.recentActivity.map(homeActivityViewItem);

  return { filters, items, allItems: items };
}

// Builds HomePreviewData from db/queries-home.ts's bounded HomeReadModel —
// see this section's own top comment for the SQL/presentation boundary.
// `ready` mirrors createHomePreviewData's own readiness gate: whether the
// caller's fetch of `model` has completed at all (a HomeReadModel is
// itself always "complete" once fetched — unlike the legacy Dashboard path,
// there's no separate aggregate-readiness boundary here, since
// monthTotals/categoryTotalsByCurrency are read inside the exact same
// snapshot as everything else in HomeReadModel, never a second, separately
// timed request).
export function createHomePreviewDataFromReadModel(
  model: HomeReadModel,
  ready: boolean,
  now = new Date(),
): HomePreviewDataFromReadModel {
  const hasRealData =
    ready &&
    (model.accounts.length > 0 ||
      model.detectedAccounts.length > 0 ||
      model.unassignedReadings.length > 0 ||
      model.recentActivity.length > 0 ||
      model.totalActivityCount > 0 ||
      model.subscriptionOverview.items.length > 0 ||
      model.subscriptionOverview.activeCount > 0 ||
      model.subscriptionOverview.cancelledCount > 0);
  const currencies = model.availableCurrencies;
  // flowDays/calendarMonths inside `model` were already read scoped to
  // model.currency — trusting anything else here (a caller-supplied
  // selectedCurrency, say) could relabel those already-fetched INR-scoped
  // values as USD the moment a UI's "selected currency" state moved on
  // before this model was read. Selecting a different currency means
  // issuing a new home.load({ currency, at }) call, which produces a new
  // model with its own correctly-scoped currency — never reinterpreting
  // this one under a different label.
  const currency = model.currency;
  const accountCollections = buildHomeAccountPreviews(model, hasRealData);
  const account = accountCollections.accounts[0] ?? emptyAccountPreview(currency);
  const flow = homeFlow(model, now, currency);
  const monthLabel = formatMonthLabel(now);
  const activity = hasRealData
    ? homeActivity(model)
    : {
        filters: ACTIVITY_CATEGORY_FILTERS.map((option) => ({ ...option, count: 0 })),
        items: [],
        allItems: [],
      };
  const categories = model.categoryTotalsByCurrency[currency] ?? [];

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
      income: formatCurrencyTotals(model.monthTotals.incomeByCurrency, hasRealData),
      expense: formatCurrencyTotals(model.monthTotals.expenseByCurrency, hasRealData),
      flowChart: flow,
      calendarMonths: homeCalendarMonths(model, now, currency, hasRealData),
      categories: homeCategoriesFromAggregate(categories, currency),
      availableCurrencies: currencies,
      selectedCurrency: currency,
    },
    budget: {
      monthLabel,
      spent: formatCurrencyTotals(model.monthTotals.expenseByCurrency, hasRealData),
      limit: null,
      usedPercent: null,
      remaining: null,
    },
    subscriptions: homeSubscriptions(model, hasRealData, currency),
    activity: { dateLabel: formatDateHeading(now), ...activity },
  };
}

