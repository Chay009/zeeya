// Storage-neutral dashboard data returned by the active data source.
// Today the source is local SQLite; a future server source should return the
// same shape so screens do not need to know where the values came from.
import type { ProductActivityCategory } from "./activity-filters";
import type { MessageInsights } from "./message-insights";

export interface MonthTotalsByCurrency {
  incomeByCurrency: Record<string, number>;
  expenseByCurrency: Record<string, number>;
}

export interface CategoryTotal {
  category: string;
  totalMinorUnits: number;
}

export interface DashboardAggregates {
  monthTotals: MonthTotalsByCurrency;
  categoryTotalsByCurrency: Record<string, CategoryTotal[]>;
}

// One point in a day-bucketed series (Insights' 31-day spend/income chart).
// `day` is the bucket's own local-midnight timestamp, matching
// insights-data.ts's buildDirectionSeries so a chart fed by either source
// places points identically.
export interface DailyValue {
  day: number;
  totalMinorUnits: number;
}

// One point in a month-bucketed series (Insights' 6-month trend). `monthStart`
// is that month's own local first-of-month timestamp.
export interface MonthlyValue {
  monthStart: number;
  totalMinorUnits: number;
}

export interface FinancialPeriodSummary {
  incomeMinorUnits: number;
  spendingMinorUnits: number;
  netMinorUnits: number;
  transactionCount: number;
}

export interface BudgetMonthPerformance {
  monthStart: number;
  budgetMinorUnits: number;
  spentMinorUnits: number;
  daysWithinBudget: number;
  daysOverBudget: number;
  adherenceScore: number;
}

export interface BudgetPerformance {
  dailyBudgetMinorUnits: number;
  currentMonthBudgetMinorUnits: number;
  currentMonthSpentMinorUnits: number;
  elapsedDays: number;
  daysWithinBudget: number;
  daysOverBudget: number;
  adherenceScore: number;
  averageDailySpendMinorUnits: number;
  projectedMonthSpendMinorUnits: number;
  remainingMinorUnits: number;
  usedPercent: number;
  months: BudgetMonthPerformance[];
  // Local-midnight dates whose evaluated daily spend crossed the configured
  // target. Optional for older remote adapters; SQL-backed local reads fill it.
  overBudgetDayStarts?: number[];
}

export interface RankedSpendingComparison {
  category: string;
  currentMinorUnits: number;
  previousMinorUnits: number;
  deltaMinorUnits: number;
  changePercent: number | null;
}

export interface VendorSpendingComparison {
  vendor: string;
  // The projection's canonical merchant+currency identity. Keeping this
  // alongside the display label lets detail reads reuse the normalized seam
  // instead of trying to reproduce merchant normalization in SQL.
  identityKey?: string;
  currentMinorUnits: number;
  previousMinorUnits: number;
  deltaMinorUnits: number;
  changePercent: number | null;
  transactionCount: number;
}

export interface SubscriptionInsightsSummary {
  activeCount: number;
  likelyCount: number;
  monthlyCommittedMinorUnits: number;
  top: SubscriptionSummary[];
}

export interface UpcomingPayment {
  id: string;
  source: "subscription";
  merchant: string;
  amountMinorUnits: number;
  currency: string;
  expectedAt: number;
  confidence: "likely" | "possible";
  estimated: true;
}

export interface InsightsOverviewQuery {
  currency: string;
  at: number;
  dailyBudgetMinorUnits?: number;
  historyMonths?: number;
  limit?: number;
  // Optional bounded scope override for analytics consumers that compare two
  // explicit periods instead of the default calendar-month windows.
  period?: InsightsPeriodRange;
}

export interface InsightsPeriodRange {
  currentFrom: number;
  currentTo: number;
  previousFrom: number;
  previousTo: number;
}

/** Where money came in from: an employer, a payer, or the income category. */
export interface IncomeSourceComparison {
  source: string;
  currentMinorUnits: number;
  previousMinorUnits: number;
  deltaMinorUnits: number;
  changePercent: number | null;
  transactionCount: number;
}

/** The single biggest credit this period. */
export interface LargestCredit {
  source: string;
  amountMinorUnits: number;
  date: number;
}

export interface InsightsOverview {
  currency: string;
  currentMonth: FinancialPeriodSummary;
  previousMonth: FinancialPeriodSummary;
  spendingChangePercent: number | null;
  topCategories: RankedSpendingComparison[];
  topVendors: VendorSpendingComparison[];
  /** Optional so overviews cached before income sources existed still load. */
  topIncomeSources?: IncomeSourceComparison[];
  largestCredit?: LargestCredit | null;
  subscriptions: SubscriptionInsightsSummary;
  budget: BudgetPerformance | null;
}

export interface HomeTodaySummary extends FinancialPeriodSummary {
  recent: TransactionSummary[];
  largestTransaction: TransactionSummary | null;
}

export interface HomeSubscriptionSnapshot {
  activeCount: number;
  likelyCount: number;
  expectedMonthlyMinorUnits: number;
  spentThisMonthMinorUnits: number;
  nextPayment: UpcomingPayment | null;
}

export interface HomeHighlightsQuery {
  currency: string;
  at: number;
  accountId?: string;
  recentLimit?: number;
  upcomingLimit?: number;
}

export interface HomeActivityScopeQuery {
  accountId?: string;
}

export interface HomeActivityScopeSummary {
  categoryCounts: HomeActivityCategoryCount[];
  totalActivityCount: number;
}

export interface HomeAccountCashflowScopeQuery {
  accountId: string;
  currency: string;
  at: number;
}

export interface HomeAccountCashflowScope {
  flowDays: HomeFlowDay[];
  incomeMinorUnits: number;
  expenseMinorUnits: number;
  categoryTotals: CategoryTotal[];
  calendarMonths: HomeCalendarMonthsPage;
}

export interface HomeHighlights {
  currency: string;
  today: HomeTodaySummary;
  subscriptions: HomeSubscriptionSnapshot;
  // Full count of projected upcoming charges in the recency window — not
  // capped by upcomingLimit, so Home can show honest "+N more" copy.
  upcomingPaymentCount: number;
  // Sum of every projected due-soon charge (not capped by upcomingLimit).
  upcomingPaymentsTotalMinorUnits: number;
  upcomingPayments: UpcomingPayment[];
}

// Mirrors lib/subscriptions.ts's Subscription, plus the stable `id` the
// persisted projection has and the pure heuristic result doesn't need.
export interface SubscriptionSummary {
  id: string;
  merchant: string;
  amountMinorUnits: number;
  currency: string;
  count: number;
  lastDate: number;
  confidence: "likely" | "possible";
}

export interface TransactionFilters {
  from?: number;
  to?: number;
  currency?: string;
  direction?: "income" | "expense" | "neutral";
  accountId?: string;
  category?: string;
  search?: string;
}

export interface TransactionCursor {
  date: number;
  id: string;
}

export interface TransactionPageQuery extends TransactionFilters {
  limit?: number;
  cursor?: TransactionCursor;
}

export interface TransactionPage {
  items: TransactionSummary[];
  nextCursor: TransactionCursor | null;
}

export interface TransactionSummary {
  id: string;
  date: number;
  amountMinorUnits: number;
  currency: string;
  direction: "income" | "expense" | "neutral";
  accountId: string | null;
  trxTypeRich: string | null;
  vendor: string | null;
  brandName: string | null;
  category: string;
  ref: string | null;
  bankName: string | null;
  mandateId: string | null;
}

// Everything TransactionSummary has, plus the category-specific product
// fields the Transaction Detail screen renders — an explicit allowlist off
// the originating sms_ledger row's parsed_result, never the complete
// MalanaResult. Deliberately excludes: raw SMS body, grammar tags, the
// parser's token tree, and categoryMatches/evidence (why a category
// matched) — none of those are real product-detail fields; they're what
// the current dev-only debug screen shows (see
// features/home-preview/data.ts's transactionDetailSections, which Phase
// 1C replaces). See db/queries-transactions.ts's queryTransactionDetail
// for the exact join/validation/allowlist this type documents.
export interface TransactionDetail extends TransactionSummary {
  merchantCategory: string | null;
  subcategory: string | null;
  trxType: string | null;
  // null (not false) when the originating ledger row's parsed_result is
  // missing, corrupt, or fails schema validation — a real "the parser said
  // no" and "we don't actually know" must never collapse to the same
  // false, since a caller could otherwise report "not from a card" when
  // detail simply wasn't available. See db/queries-transactions.ts's
  // boolField.
  isFromCard: boolean | null;
  creditLimit: string | null;
  bene: string | null;
  beneAcc: string | null;
  location: string | null;
  billAmount: string | null;
  emiAmount: string | null;
  dueDate: string | null;
  policyNo: string | null;
  rechargeAmount: string | null;
  mandateAmount: string | null;
  mandateEvent: "active" | "cancelled" | null;
  mandateMerchant: string | null;
  pnr: string | null;
  flight: string | null;
  departure: string | null;
  departureCode: string | null;
  arrival: string | null;
  arrivalCode: string | null;
  fare: string | null;
  trainBusNo: string | null;
  boardingGate: string | null;
  orderNo: string | null;
  trackingId: string | null;
  deliveryStatus: string | null;
  item: string | null;
  otp: string | null;
  otpExpiry: string | null;
  cashback: string | null;
  discount: string | null;
  offerCode: string | null;
  offerCategory: string | null;
  dataLeft: string | null;
  packBalance: string | null;
  navValue: string | null;
  folio: string | null;
  marginAmount: string | null;
  // Same null-means-unknown rule as isFromCard above.
  isOnlineBrand: boolean | null;
  upiHandle: string | null;
}

// Alias for lib/activity-filters.ts's ProductActivityCategory — the single
// canonical stored-category type (see that file's own STORED_ACTIVITY_
// CATEGORIES for the matching runtime tuple db/schema.ts and
// db/queries-home.ts both derive from) rather than an independently
// hand-typed union that could silently drift from it.
export type ActivityCategory = ProductActivityCategory;

// Presentation-scoped fields for one activity row — a category-tagged
// message that may or may not also be a financial transaction (e.g. a
// delivery notice has no amount/direction). Mirrors what
// features/home-preview/data.ts's buildActivity actually reads to build
// its ActivityItem row (name/date/amount/pills), not the full ParsedSms.
export interface ActivitySummary {
  id: string;
  date: number;
  category: ActivityCategory;
  bankName: string | null;
  brandName: string | null;
  vendor: string | null;
  trxTypeRich: string | null;
  subcategory: string | null;
  mandateEvent: "active" | "cancelled" | null;
  isFromCard: boolean;
  amountMinorUnits: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral" | null;
}

export interface ActivityCursor {
  date: number;
  id: string;
}

export interface ActivityQuery {
  category?: ActivityCategory;
  from?: number;
  to?: number;
  limit?: number;
  cursor?: ActivityCursor;
}

export interface ActivityPage {
  items: ActivitySummary[];
  nextCursor: ActivityCursor | null;
}

// Everything ActivitySummary has, plus the same category-specific product
// allowlist TransactionDetail carries — necessary because not every
// activity row has a transactions row to join (a pure travel/delivery/OTP/
// event/offer message never produces one; projectTransaction requires both
// a parsed amount and trxTypeRich). db/queries-transactions.ts's
// queryActivityDetail seeks the one identified activity row by its own
// primary key, joins its single ledger row, and left-joins transactions by
// the shared smsId only to pick up transactionId/accountId/ref/
// merchantCategory — the category-specific fields below always come from
// the validated ledger JSON allowlist, never a raw spread. Same excludes
// as TransactionDetail: no raw SMS body, tags, tokens, or
// categoryMatches/evidence.
//
// Deliberately does NOT redeclare isFromCard: ActivitySummary's own
// isFromCard is a real, always-known boolean (activity.is_from_card is
// NOT NULL, written once at projection time from the parser's own
// result.isFromCard, which is itself never optional) — unlike
// TransactionDetail's isFromCard, whose null case represents "the
// ledger JSON wasn't available to re-derive this from." Those are two
// different fields that happen to share a name in TransactionDetail;
// ActivityDetail only ever needs the first, already-known one.
export interface ActivityDetail extends ActivitySummary {
  // Present only when this activity row does have a matching transactions
  // row (associationKind-equivalent: a financial message) — null for a
  // pure non-financial activity item (travel/delivery/OTP/event/offer).
  transactionId: string | null;
  accountId: string | null;
  ref: string | null;
  merchantCategory: string | null;
  trxType: string | null;
  creditLimit: string | null;
  bene: string | null;
  beneAcc: string | null;
  location: string | null;
  billAmount: string | null;
  emiAmount: string | null;
  dueDate: string | null;
  policyNo: string | null;
  rechargeAmount: string | null;
  mandateAmount: string | null;
  mandateMerchant: string | null;
  pnr: string | null;
  flight: string | null;
  departure: string | null;
  departureCode: string | null;
  arrival: string | null;
  arrivalCode: string | null;
  fare: string | null;
  trainBusNo: string | null;
  boardingGate: string | null;
  orderNo: string | null;
  trackingId: string | null;
  deliveryStatus: string | null;
  item: string | null;
  otp: string | null;
  otpExpiry: string | null;
  cashback: string | null;
  discount: string | null;
  offerCode: string | null;
  offerCategory: string | null;
  dataLeft: string | null;
  packBalance: string | null;
  navValue: string | null;
  folio: string | null;
  marginAmount: string | null;
  isOnlineBrand: boolean | null;
  upiHandle: string | null;
}

// Flat confirmed-account view — mirrors dashboard.ts's AccountBalance minus
// `history` (see BalanceReadingPage below for that, paginated separately:
// an account's reading history grows without bound over the account's
// lifetime, unlike the small, naturally-capped set of confirmed accounts
// themselves — see accounts.list's own comment for why that one stays
// unpaginated).
export interface AccountSummary {
  id: string;
  bankName: string;
  last4: string;
  currency: string;
  anchorStatus: "reported" | "unreported";
  balanceMinorUnits: number | null;
  balanceAsOf: number;
  balanceSender: string;
  estimatedBalanceMinorUnits: number | null;
  estimatedAsOf: number;
  reconciliationDeltaMinorUnits: number | null;
  capturedIncomeMinorUnits: number;
  capturedExpenseMinorUnits: number;
  capturedChangeMinorUnits: number;
  capturedTransactionCount: number;
}

// Mirrors dashboard.ts's DetectedAccount: weaker identity evidence (a
// mandate notice, say) that never carried a real transaction or reported
// balance, so it never became a confirmed AccountSummary row.
export interface DetectedAccountSummary {
  id: string;
  bankName: string;
  last4: string;
  currency: string;
  asOf: number;
  sender: string;
}

// Profile/settings copy needs both confirmed and detected account totals
// without issuing two independent list() calls that could observe different
// projection revisions between reads.
export interface AccountScopeCounts {
  confirmedCount: number;
  detectedCount: number;
}

export type BalanceReadingAssociationKind = "confirmed" | "suggested" | "unassigned";

export interface BalanceReadingSummary {
  id: string;
  accountId: string | null;
  balanceMinorUnits: number;
  currency: string;
  asOf: number;
  detectedBankName: string;
  detectedAccount: string | null;
  associationKind: BalanceReadingAssociationKind;
  sender: string;
  reconciliationPreviousAsOf: number | null;
  reconciliationExpectedBalanceMinorUnits: number | null;
  reconciliationDeltaMinorUnits: number | null;
  capturedIncomeMinorUnits: number | null;
  capturedExpenseMinorUnits: number | null;
  capturedTransactionCount: number | null;
}

export interface BalanceReadingCursor {
  asOf: number;
  id: string;
}

export interface BalanceHistoryQuery {
  accountId: string;
  limit?: number;
  cursor?: BalanceReadingCursor;
}

// Unassigned readings (no confirmed account — see BalanceReadingSummary's
// associationKind) are scoped by bank name rather than accountId, since by
// definition they have no account to scope to.
export interface UnassignedReadingsQuery {
  bankName: string;
  limit?: number;
  cursor?: BalanceReadingCursor;
}

export interface BalanceReadingPage {
  items: BalanceReadingSummary[];
  nextCursor: BalanceReadingCursor | null;
}

// Mirrors dashboard.ts's Mandate minus `history` (see MandateEventPage
// below for that, paginated separately) — confirmed Autopay/standing-
// instruction evidence with a real UMN, distinct from SubscriptionSummary's
// inferred-recurrence heuristic (see subscriptions table's own schema
// comment for why the two never describe the same charge).
export interface MandateSummary {
  mandateId: string;
  merchant: string;
  amountMinorUnits: number | null;
  currency: string;
  status: "active" | "cancelled";
  createdAt: number;
  lastUpdated: number;
  sender: string;
}

export interface MandateCursor {
  lastUpdated: number;
  mandateId: string;
}

export interface MandateQuery {
  limit?: number;
  cursor?: MandateCursor;
}

export interface MandatePage {
  items: MandateSummary[];
  nextCursor: MandateCursor | null;
}

// Mirrors dashboard.ts's MandateEvent.
export interface MandateEventSummary {
  id: string;
  mandateId: string;
  status: "active" | "cancelled";
  date: number;
  sender: string;
}

export interface MandateEventCursor {
  date: number;
  id: string;
}

export interface MandateEventQuery {
  mandateId: string;
  limit?: number;
  cursor?: MandateEventCursor;
}

export interface MandateEventPage {
  items: MandateEventSummary[];
  nextCursor: MandateEventCursor | null;
}

export interface SubscriptionQuery {
  at?: number;
}

// ── Home read model ─────────────────────────────────────────────────────────
// One bounded, revision-consistent read backing the entire Home screen —
// the whole object (including aggregates/currencies below) is produced
// inside a single db/projection-snapshot.ts readConsistentSnapshot()
// callback (Phase 1B.4 sub-slice 3), so no two pieces of it can ever come
// from different published revisions. SQL/query functions own filtering,
// aggregation, ordering, and pagination; createHomePreviewData
// (features/home-preview/data.ts) keeps owning presentation composition —
// labels, colors, chart shapes, percentages, card models — building the
// existing HomePreviewData/HomeAccount/etc. shapes from this instead of
// from the complete Dashboard. Nothing in this model is the full message
// history: every collection here is either naturally small (accounts,
// detected accounts — same "small human-bounded set" reasoning as their
// own standalone FinanceDataSource methods) or explicitly bounded (the
// last-N-days flow, the last-N-months calendar window, a small
// recent-activity slice, a capped mandate/subscription preview with a
// separately-computed whole-set summary, a few recent events per mandate).

// One latest unassigned balance reading per bank — mirrors
// buildAccountPreviews's own `bank.unassignedReadings[0]` usage: Home only
// ever shows the single most recent unassigned reading per bank, never a
// full paginated history (that's accounts.listUnassignedReadings).
export interface HomeUnassignedReadingSummary extends BalanceReadingSummary {
  bankName: string;
}

// Home's own "is a newer, not-yet-confirmed reading sitting on top of this
// account" cross-check (buildAccountPreviews's newerSuggested lookup) —
// carried as a flag on the account itself rather than requiring the
// caller to re-cross-reference HomeUnassignedReadingSummary entries
// against every account's own bankName/last4/asOf.
export interface HomeAccountSummary extends AccountSummary {
  hasNewerSuggestedReading: boolean;
}

// A small, bounded recent-events tail per mandate — not the full paginated
// history mandates.listEvents() serves for a dedicated mandate-detail
// screen. Populated via a single batched query (ROW_NUMBER() OVER
// (PARTITION BY mandate_id ORDER BY date DESC, id DESC), rows numbered <=
// HOME_MANDATE_RECENT_EVENTS_LIMIT), not one mandates.listEvents() call per
// mandate. Only ever populated for the capped preview mandates in
// HomeSubscriptionOverview.items — the whole-set totals/counts below don't
// need any mandate's event history at all.
export interface HomeMandatePreview extends MandateSummary {
  recentEvents: MandateEventSummary[];
  // dashboard.ts's own reactivated rule (status === "active" AND some
  // historical event was "cancelled") computed by SQL over the mandate's
  // COMPLETE event history — never derived from recentEvents alone, since
  // an older cancellation predating the bounded recent-events tail would
  // otherwise go undetected and this would silently report false.
  reactivated: boolean;
}

// One subscription-or-mandate card for Home's capped preview list —
// mirrors PreviewSub's own two source shapes (previewFromMandate/
// previewFromSubscription) enough for presentation composition to build
// either from this single discriminated shape.
export type HomeSubscriptionPreviewItem =
  | ({ kind: "mandate" } & HomeMandatePreview)
  | ({ kind: "subscription" } & SubscriptionSummary);

// The full subscriptions+mandates picture for Home, split into a small
// capped preview (bounded — a handful of cards, each with its own
// recentEvents timeline where applicable) and whole-set totals/counts
// computed by SQL over the complete mandates+subscriptions tables — never
// by summing/counting only the capped preview items, which would silently
// under-report once either table exceeds the preview's own cap. Mandates
// are NOT naturally bounded the way accounts are (a cancelled/expired
// mandate's row is never deleted — see mandates.list's own paginated API),
// so this overview's totals/counts must come from a real SQL aggregation
// over the whole table, not a JS sum over a capped array.
export interface HomeSubscriptionOverview {
  items: HomeSubscriptionPreviewItem[];
  totalsByCurrency: Record<string, number>;
  activeCount: number;
  cancelledCount: number;
}

// One day's income/expense totals for the 7-day flow chart — day is that
// day's own local-midnight timestamp, matching insights-data.ts's
// buildDirectionSeries/DailyValue convention so the two can't silently
// place points differently.
export interface HomeFlowDay {
  day: number;
  incomeMinorUnits: number;
  expenseMinorUnits: number;
}

// One day's net-signed activity within a calendar month — day is that
// day's own local-midnight timestamp, matching HomeFlowDay's convention.
// Only present for a day that actually has activity (buildCalendarMonths's
// own `nets` record is sparse the same way — it's keyed only by days that
// had at least one entry, not every day in the month).
export interface HomeCalendarDay {
  day: number;
  incomeMinorUnits: number;
  expenseMinorUnits: number;
}

// One calendar month's income/expense totals, plus its own bounded set of
// daily net values (HomeCalendarDay[], at most 31 entries — a calendar
// month can never have more days than that, so this remains a bounded
// nested collection, not an unbounded one) — buildCalendarMonths's
// per-day `nets` record needs day-level granularity, not just the month
// total. monthStart is that month's own local first-of-month timestamp,
// matching MonthlyValue's convention. A HomeCalendarMonth itself is always
// present for every month in the requested window, including a month with
// zero transactions (a zero-value bucket with an empty `days` array, not
// an absent month) — buildCalendarMonths renders every month in its range
// whether or not it has activity.
export interface HomeCalendarMonth {
  monthStart: number;
  incomeMinorUnits: number;
  expenseMinorUnits: number;
  days: HomeCalendarDay[];
}

export interface HomeCalendarCursor {
  monthStart: number;
}

export interface HomeCalendarMonthsQuery {
  currency: string;
  at: number;
  monthsBack?: number;
  cursor?: HomeCalendarCursor;
  accountId?: string;
}

export interface HomeCalendarMonthsPage {
  items: HomeCalendarMonth[];
  // Present when there is earlier history beyond this page's oldest month
  // — a caller (a future "load earlier months" calendar interaction) can
  // page further back with this as the next request's cursor. null when
  // the oldest month in this page has no earlier activity at all.
  nextCursor: HomeCalendarCursor | null;
}

// One row per SMS (not one row per matched category, unlike the activity
// table's own per-(smsId, category) storage) — mirrors buildActivity's
// ActivityItem exactly: every matched category on the message
// (categoryFilters), the merchant-name fallback chain buildActivity's own
// merchantName() uses (brandName -> vendor -> bene -> bankName -> sender —
// see activity's own bene/merchantCategory/sender columns, added
// specifically so this DTO never needs to join sms_ledger), and the
// category-suggestion/recurring signals the row-level presentation pills
// need. categorySuggestions is still computed in TypeScript from this
// row's own bankName/brandName/vendor/merchantCategory/categories fields
// (the same rule dashboard.ts's own activityCategorySuggestions already
// applies) — not separately queried per row. isRecurring, unlike
// categorySuggestions, is NOT computed from this row in TypeScript — see
// its own field comment for why it must come from SQL instead.
// Which detail screen/query a tap on this Home activity row should open,
// and the exact id to open it with — the UI must never guess this from
// categories[0] (categories[] is not guaranteed to be produced in any
// particular order, since it comes from json_group_array over an
// unordered set of category rows for the same smsId). A financial message
// (one with a transactions row) always targets that transaction via
// transactions.get(id) — never the activity table, even if it also
// matched a product category — since the transaction detail already
// carries every category-specific field the activity detail would. A
// purely non-financial message (no transactions row) targets its activity
// row via activity.get(`${smsId}|${category}`) instead, where `category`
// is chosen deterministically in SQL (e.g. the lexicographically-smallest
// matching category for that smsId), not left to the caller to pick.
export type HomeActivityDetailTarget =
  | { kind: "transaction"; id: string }
  | { kind: "activity"; id: string };

export interface HomeActivityItem {
  smsId: string;
  date: number;
  categories: ActivityCategory[];
  detailTarget: HomeActivityDetailTarget;
  accountId: string | null;
  bankName: string | null;
  brandName: string | null;
  vendor: string | null;
  bene: string | null;
  merchantCategory: string | null;
  sender: string;
  trxTypeRich: string | null;
  subcategory: string | null;
  mandateEvent: "active" | "cancelled" | null;
  isFromCard: boolean;
  amountMinorUnits: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral" | null;
  // Computed in SQL against the complete mandates + subscriptions tables
  // (dashboard.ts's own isRecurringTransaction rule: a real mandateId
  // match OR a same-merchant-amount subscription match), never against
  // only subscriptionOverview's own capped preview — a subscription
  // outside that preview must still mark its transactions as recurring
  // here. The subscription-match half joins on
  // transactions.subscriptionIdentityKey (see schema.ts's own comment) —
  // already the exact `${normalizeMerchant(merchant)}|${currency}`
  // composite subscriptions.id uses, so this is a plain equality join,
  // not a re-implementation of normalizeMerchant's regex/lowercasing
  // rules in SQL. Mandate matching uses transactions.
  // mandateId directly (a real column already), no normalization needed.
  isRecurring: boolean;
}

// One category's count of matching activity items — COUNT(DISTINCT smsId),
// not COUNT(*), so a message matching more than one category is still
// counted once per category it actually matches, never inflated by its
// own per-category row multiplicity in the underlying activity table.
export interface HomeActivityCategoryCount {
  category: ActivityCategory;
  count: number;
}

export interface HomeReadModelQuery {
  currency: string;
  at: number;
}

// Home's own filter pill selection (ActivitySection's own "filter, then
// take five" behavior) — a single globally-capped recentActivity array
// cannot preserve this: a category whose newest matching item is 6th or
// later in the unfiltered global feed would show as empty even though it
// genuinely has matches, since the top-5 global cap already excluded it.
// This is the bounded, on-demand query a selected pill (anything other
// than "all") issues instead of filtering HomeReadModel.recentActivity in
// JS.
//
// Required two-stage SQL, not a single filtered GROUP BY: activity rows
// are one row per (smsId, category), so filtering rows by `category`
// before grouping (WHERE category = ? ... GROUP BY sms_id) would only
// json_group_array the rows that already matched — silently erasing a
// matched message's OTHER categories from its own `categories[]`, even
// though HomeActivityItem promises the complete set. The query must
// instead (1) select the ordered, limited set of matching smsIds (WHERE
// category = ? ORDER BY date DESC, id DESC LIMIT ?), then (2) aggregate
// ALL activity rows for exactly those smsIds (WHERE sms_id IN (...) GROUP
// BY sms_id) — the same two-stage shape whether or not `category` is
// provided (the "all" case skips stage 1's WHERE clause but still groups
// every row for the selected smsIds in stage 2).
export interface HomeRecentActivityQuery {
  category?: ActivityCategory;
  // When set, stage-1 candidate selection is scoped to activity.account_id
  // (see db/queries-home.ts's account-scoped ORDER BY date DESC, id DESC).
  accountId?: string;
  // Period scope: activity.date in [from, to) (epoch ms). With both set the
  // limit may go up to HOME_ACTIVITY_PERIOD_MAX_LIMIT — the period is the bound.
  from?: number;
  to?: number;
  // Only messages carrying a transaction amount (the Transactions tab).
  transactionsOnly?: boolean;
  // Free-text search: every word must match merchant, payee, bank, category
  // or transaction type; a number also matches the exact amount. The limit
  // may go up to HOME_ACTIVITY_SEARCH_MAX_LIMIT.
  search?: string;
  limit?: number;
  // The clock isRecurring's subscription-match half is evaluated against —
  // an aged-out subscription (lastDate older than RECENCY_WINDOW_DAYS from
  // `at`) must not mark a transaction recurring, the same recency rule
  // dashboard.ts's own subscriptions derivation already applies. Defaults
  // to the real current time when omitted, not a fixed epoch, so a caller
  // that doesn't pass it still gets today's correct recency window rather
  // than a stale one.
  at?: number;
}

// The single bounded object backing Home. Every field here is what
// features/home-preview/data.ts's createHomePreviewData actually reads
// today (see its own dashboard.accounts/detectedAccounts/banks/mandates/
// subscriptions/activity/recent usage) — narrowed to the bounded
// equivalents above, nothing added speculatively.
export interface HomeReadModel {
  // The exact currency flowDays/calendarMonths below are scoped to — the
  // same value the caller's own HomeReadModelQuery.currency requested.
  // Carried on the result itself (not left for the caller to remember
  // separately) so a consumer can never combine this model's flow/calendar
  // values with a DIFFERENT currency than the one they were actually
  // queried against — e.g. a UI's own "selected currency" state changing
  // between when a load() was issued and when its result is read must not
  // silently relabel INR-scoped values as USD. Selecting a different
  // currency means issuing a new home.load({ currency, at }) call, not
  // reinterpreting this one's flowDays/calendarMonths under a new label.
  currency: string;
  accounts: HomeAccountSummary[];
  detectedAccounts: DetectedAccountSummary[];
  unassignedReadings: HomeUnassignedReadingSummary[];
  // Read inside the same snapshot as everything else here — a separate
  // dashboard.loadAggregates() call after this read returns could combine
  // Home's own revision N data with month/category totals from revision
  // N + 1. availableCurrencies mirrors dashboard.listCurrencies for the
  // same reason: the currency picker must reflect the exact same revision
  // the rest of this model does.
  monthTotals: MonthTotalsByCurrency;
  categoryTotalsByCurrency: Record<string, CategoryTotal[]>;
  availableCurrencies: string[];
  flowDays: HomeFlowDay[];
  calendarMonths: HomeCalendarMonthsPage;
  subscriptionOverview: HomeSubscriptionOverview;
  // Bounded activity preview for the unfiltered ("all") pill — mirrors
  // buildActivity's own `allItems.slice(0, 5)` sizing for the Home preview
  // list (the full activity list is activity.list's own paginated
  // concern, a separate screen). Selecting any other filter pill issues a
  // separate home.loadRecentActivity({ category }) call instead of
  // filtering this array in JS — see HomeRecentActivityQuery's own
  // comment for why.
  recentActivity: HomeActivityItem[];
  activityCategoryCounts: HomeActivityCategoryCount[];
  // COUNT(DISTINCT smsId) over every activity row, not
  // recentActivity.length (capped) and not a sum of
  // activityCategoryCounts (would overcount a message matching more than
  // one category).
  totalActivityCount: number;
}

// ── Budgets ──────────────────────────────────────────────────────────────
// Monthly limits per spending category, set by the user (user-owned data,
// not derived from SMS). One currency at a time.

export interface BudgetOverviewQuery {
  currency: string;
  at: number;
}

export interface CategoryBudgetStatus {
  category: string;
  limitMinorUnits: number;
  /** Expense in this category, this calendar month so far. */
  spentMinorUnits: number;
}

/** A category the user spends in — the candidates for a budget. */
export interface BudgetCategorySpend {
  category: string;
  thisMonthMinorUnits: number;
  /** Mean monthly spend over the last three full months (0 when none). */
  averageMonthlyMinorUnits: number;
}

export interface BudgetOverview {
  currency: string;
  monthStart: number;
  /** Exclusive: the next month's first local midnight. */
  monthEnd: number;
  budgets: CategoryBudgetStatus[];
  categories: BudgetCategorySpend[];
}

export interface CategoryBudgetInput {
  category: string;
  currency: string;
  /** null removes the budget. */
  monthlyLimitMinorUnits: number | null;
}

// RPC-shaped without depending on tRPC itself. The native implementation
// executes local SQLite queries; a future server adapter can implement this
// exact serializable contract with tRPC procedures.
export interface FinanceDataSource {
  dashboard: {
    loadAggregates(input: {
      currencies: readonly string[];
      at: number;
    }): Promise<DashboardAggregates>;
    // Every currency with projected activity — lets a caller discover which
    // currencies exist without holding the full message history just to
    // enumerate them (see stores/dashboard-store.ts's dashboardCurrencies).
    listCurrencies(): Promise<string[]>;
  };
  accounts: {
    // Unpaginated: the number of bank accounts a real device ever confirms
    // is small and human-bounded (a handful, never thousands) — unlike
    // balance history or transactions, which grow with every SMS. See Step
    // 3's "small fixed collections" allowance.
    list(): Promise<AccountSummary[]>;
    listDetected(): Promise<DetectedAccountSummary[]>;
    scopeCounts(): Promise<AccountScopeCounts>;
    // Unassigned readings can grow without bound (any bank whose SMS never
    // yields account digits keeps adding rows with no account to attach
    // to), so this is paginated the same way balance history is.
    listUnassignedReadings(input: UnassignedReadingsQuery): Promise<BalanceReadingPage>;
    listBalanceHistory(input: BalanceHistoryQuery): Promise<BalanceReadingPage>;
  };
  transactions: {
    list(input: TransactionPageQuery): Promise<TransactionPage>;
    // Single-row lookup by id — the one sanctioned exception to "SQL never
    // joins back to sms_ledger": category-specific fields (travel, delivery,
    // OTP, bills, ...) live only in the ledger's parsed_result JSON today,
    // and this reads exactly the one row the caller asked for, not a scan.
    // Never returns the raw SMS body, tags, or token tree — see
    // TransactionDetail's own comment.
    get(id: string): Promise<TransactionDetail | null>;
  };
  activity: {
    list(input: ActivityQuery): Promise<ActivityPage>;
    // Single-row lookup by the activity row's own id (`${smsId}|${category}`)
    // — the Activity screen opens a detail view for every category,
    // including non-financial ones (travel/delivery/OTP/event/offer) with
    // no transactions row to join, which is exactly why this exists
    // separately from transactions.get. Same sanctioned single-row ledger
    // join as transactions.get: seeks one activity row, joins its one
    // ledger row, never scans. See ActivityDetail's own comment.
    get(activityId: string): Promise<ActivityDetail | null>;
  };
  mandates: {
    // Unlike accounts, mandates are not inherently human-bounded — a
    // cancelled or expired mandate's row is never deleted, so the count
    // grows over the ledger's lifetime the same way transactions/activity
    // do. Keyset-paginated by (lastUpdated DESC, mandateId DESC).
    list(input?: MandateQuery): Promise<MandatePage>;
    get(mandateId: string): Promise<MandateSummary | null>;
    // Event history grows with every create/execute/cancel message for a
    // mandate over its lifetime, unlike the mandate row itself — paginated
    // the same way balance history is.
    listEvents(input: MandateEventQuery): Promise<MandateEventPage>;
    // Latest events for many mandates in one read (newest-first, capped per
    // mandate) — for list screens that need every mandate's recent history
    // at once, instead of one listEvents call per mandate.
    listRecentEventsFor(
      mandateIds: readonly string[],
      limitPerMandate?: number,
    ): Promise<Map<string, MandateEventSummary[]>>;
  };
  subscriptions: {
    // Unpaginated: subscriptions are one row per distinct merchant+currency
    // a device has ever inferred recurrence for — small and human-bounded,
    // same allowance as accounts.list/mandates.list. Recency (excluding an
    // entry whose lastDate has aged past the recency window) is applied at
    // query time against `at` (defaults to now), not a write-time filter —
    // see db/schema.ts's subscriptions table comment for why the row
    // itself is never deleted just because it aged out.
    list(input?: SubscriptionQuery): Promise<SubscriptionSummary[]>;
  };
  budgets: {
    load(input: BudgetOverviewQuery): Promise<BudgetOverview>;
    set(input: CategoryBudgetInput): Promise<void>;
  };
  insights: {
    loadOverview(input: InsightsOverviewQuery): Promise<InsightsOverview>;
    loadDailySeries(input: {
      currency: string;
      direction: "income" | "expense";
      at: number;
      days?: number;
    }): Promise<DailyValue[]>;
    loadMonthlySeries(input: {
      currency: string;
      direction: "income" | "expense";
      at: number;
      months?: number;
    }): Promise<MonthlyValue[]>;
    loadCategoryTotals(input: { currency: string; at: number }): Promise<CategoryTotal[]>;
    /**
     * Bills due, card limits, cashback, trips, deliveries, NAVs, data packs
     * and the payment mix — from the message_facts projection.
     */
    loadMessageInsights(input: { currency: string; at: number }): Promise<MessageInsights>;
  };
  home: HomeDataSource;
}

// Every method returns data from a fully caught-up projection, never merely
// one that was fresh when the call started. load() composes the full Home
// model, while loadCalendarMonths() and loadRecentActivity() each use a
// bounded two-statement strategy. All three therefore use
// readConsistentSnapshot() so a projection publish between statements
// causes the complete read to retry.
export interface HomeDataSource {
  // One revision-consistent read backing the whole Home screen — see
  // HomeReadModel's own comment and this interface's own top comment.
  load(input: HomeReadModelQuery): Promise<HomeReadModel>;
  // Small, independently refreshable Home facts. This is deliberately
  // separate from the larger HomeReadModel so an eventual UI can refresh
  // today's transactions/upcoming payments without rebuilding calendar,
  // accounts, and activity projections.
  loadHighlights(query: HomeHighlightsQuery): Promise<HomeHighlights>;
  // The "load earlier months" path HomeCalendarMonthsPage.nextCursor
  // exists to support — paginates further back than the initial
  // HomeReadModel.calendarMonths window, without re-fetching the whole
  // Home read model just to see more calendar history.
  loadCalendarMonths(query: HomeCalendarMonthsQuery): Promise<HomeCalendarMonthsPage>;
  // The bounded, filter-specific query a selected activity pill (anything
  // other than "all") issues — see HomeRecentActivityQuery's own comment
  // for why HomeReadModel.recentActivity alone can't serve this.
  loadRecentActivity(query: HomeRecentActivityQuery): Promise<HomeActivityItem[]>;
  loadActivityScope(query: HomeActivityScopeQuery): Promise<HomeActivityScopeSummary>;
  loadAccountCashflowScope(query: HomeAccountCashflowScopeQuery): Promise<HomeAccountCashflowScope>;
}
