// Dev-only sample data generator. Feeds realistic bank-SMS text through the
// real ingestion + projection path (not a raw table insert) so every Home
// surface (Today, Activity, Cashflow, Categories, Calendar, Budget,
// Subscriptions, Upcoming) sees the same shape of data a real device sync
// would produce. Never imported by any production screen except behind a
// __DEV__ check.
//
// Each tap on "Seed sample data" uses a fresh id prefix so you can add
// another batch without clearing the app. Upcoming / due-soon rows are
// inferred from recurring autopay history (last charge ~4 weeks ago → next
// due in a few days), not from fake future-dated SMS.
import { ingestSmsBatch, refreshDashboardProjection } from "./ingestion";
import type { RawSms } from "../lib/sms";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(now: number, days: number, hour: number, minute: number): number {
  const d = new Date(now - days * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function fmt(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ddmmyyyy(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB").replace(/\//g, "-");
}

// Spends across the last ~100 days (subscriptions need 2-3 monthly cycles to
// be detected as "likely"/"possible" — see lib/subscriptions.ts), weighted
// toward the last few weeks so Today / This week / Recent activity are dense.
// Each message's "Avail Bal" is written AFTER every message exists, in time
// order and per account — so the newest SMS for an account always carries
// that account's current balance, as a real bank's would. (Writing it as each
// helper was called made it follow call order: today's spends, written before
// today's credits, reported balances from before those credits, and every
// account shared one running total.)
const OPENING_BALANCE = 48_500;

interface Draft {
  seq: number;
  date: number;
  account: string;
  change: number;
  body: (balance: number) => string;
}

function buildSampleMessages(now: number, runKey: string): RawSms[] {
  const drafts: Draft[] = [];

  const draft = (
    daysBack: number,
    hour: number,
    minute: number,
    account: string,
    change: number,
    body: (balance: number) => string,
  ) => {
    drafts.push({
      seq: drafts.length + 1,
      date: daysAgo(now, daysBack, hour, minute),
      account,
      change,
      body,
    });
  };

  const spend = (
    daysBack: number,
    hour: number,
    minute: number,
    amount: number,
    merchant: string,
    account = "XX1234",
  ) => {
    const on = ddmmyyyy(daysAgo(now, daysBack, hour, minute));
    draft(
      daysBack,
      hour,
      minute,
      account,
      -amount,
      (balance) =>
        `INR ${fmt(amount)} debited from account ${account} towards ${merchant} on ${on}. Avail Bal: INR ${fmt(balance)}`,
    );
  };

  const income = (
    daysBack: number,
    hour: number,
    minute: number,
    amount: number,
    label: string,
    account = "XX1234",
  ) => {
    const on = ddmmyyyy(daysAgo(now, daysBack, hour, minute));
    draft(
      daysBack,
      hour,
      minute,
      account,
      amount,
      (balance) =>
        `INR ${fmt(amount)} credited to account ${account} - ${label} on ${on}. Avail Bal: INR ${fmt(balance)}`,
    );
  };

  // Recurring AUTO_DEBIT — the "...for AutoPay MERCHANTMANDATE" phrasing is
  // verified to classify as trxTypeRich "AUTO_DEBIT"; repeating at a fixed
  // amount every ~30 days is what lib/subscriptions.ts needs for "likely".
  const autopay = (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => {
    const on = ddmmyyyy(daysAgo(now, daysBack, hour, minute));
    draft(
      daysBack,
      hour,
      minute,
      "XX1234",
      -amount,
      (balance) =>
        `INR ${fmt(amount)} debited from account XX1234 towards ${merchant} for AutoPay MERCHANTMANDATE on ${on}. Avail Bal: INR ${fmt(balance)}`,
    );
  };

  seedRecurringSubscriptions(autopay);
  seedSalaryAndRent(income, spend);
  seedThisWeekActivity(spend, income);
  seedTodayGlanceEdgeCases(spend, income);
  seedCategorySpread(spend, income);

  // Oldest first (ties keep the order they were written), one running
  // balance per account.
  const balances = new Map<string, number>();
  return drafts
    .sort((a, b) => a.date - b.date || a.seq - b.seq)
    .map((item) => {
      const balance = (balances.get(item.account) ?? OPENING_BALANCE) + item.change;
      balances.set(item.account, balance);
      return {
        id: `dev-seed-${runKey}-${item.seq}`,
        sender: "VM-HDFCBK",
        body: item.body(balance),
        date: item.date,
      };
    });
}

// Six likely subscriptions with the most recent charge 24–29 days ago so
// Home's "Due soon" infers several upcoming dates (and "+N more" past 2).
function seedRecurringSubscriptions(
  autopay: (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => void,
) {
  const likely: Array<[string, number, readonly number[]]> = [
    ["Netflix Entertainment Ser", 649, [96, 66, 36, 29]],
    ["Spotify Premium", 199, [94, 64, 34, 28]],
    ["Amazon Prime Membership", 299, [92, 62, 32, 27]],
    ["Disney Plus Hotstar", 499, [90, 60, 30, 26]],
    ["YouTube Premium India", 129, [88, 58, 28, 25]],
    ["Apple iCloud Storage", 75, [86, 56, 26, 24]],
  ];
  for (const [merchant, amount, cycles] of likely) {
    for (const daysBack of cycles) autopay(daysBack, 8, 10, amount, merchant);
  }

  // Only two cycles → "possible" recurring (shows in due soon, not in expected).
  autopay(48, 9, 0, 59, "Google One Storage");
  autopay(18, 9, 0, 59, "Google One Storage");
}

function seedSalaryAndRent(
  income: (daysBack: number, hour: number, minute: number, amount: number, label: string) => void,
  spend: (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => void,
) {
  for (const cycle of [95, 65, 35, 5]) income(cycle, 9, 12, 65_000, "SALARY CREDIT");
  for (const cycle of [93, 63, 33, 3]) spend(cycle, 10, 0, 18_000, "Rent Payment");
}

// One or two spends per day for the last 7 days — cashflow bars, categories,
// and calendar all get non-empty buckets.
function seedThisWeekActivity(
  spend: (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => void,
  income: (daysBack: number, hour: number, minute: number, amount: number, label: string) => void,
) {
  const week: Array<[number, number, number, number, string]> = [
    [6, 10, 15, 420, "Zomato"],
    [6, 19, 40, 280, "Uber"],
    [5, 12, 0, 1_180, "Amazon Shopping"],
    [5, 18, 20, 650, "Swiggy"],
    [4, 9, 30, 320, "Uber"],
    [4, 20, 10, 890, "Big Bazaar"],
    [3, 13, 45, 540, "Swiggy"],
    [3, 21, 0, 1_450, "Amazon Shopping"],
    [2, 8, 0, 2_560, "Electricity Bill BESCOM"],
    [2, 17, 30, 360, "Zomato"],
    [1, 11, 20, 410, "Uber"],
    [1, 19, 5, 720, "Swiggy"],
  ];
  for (const [daysBack, hour, minute, amount, merchant] of week) {
    spend(daysBack, hour, minute, amount, merchant);
  }
  income(4, 10, 0, 3_200, "CASHBACK CREDIT");
}

// Older category mix so the Categories tab is not a single bucket.
function seedCategorySpread(
  spend: (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => void,
  income: (daysBack: number, hour: number, minute: number, amount: number, label: string) => void,
) {
  const spread: Array<[number, number, number, number, string]> = [
    [18, 13, 24, 420, "Zomato"],
    [17, 19, 5, 318, "Uber"],
    [15, 12, 40, 560, "Swiggy"],
    [14, 20, 10, 1_299, "Amazon Shopping"],
    [12, 9, 0, 180, "Uber"],
    [10, 18, 45, 740, "Zomato"],
    [8, 13, 5, 220, "Swiggy"],
    [7, 21, 30, 890, "Amazon Shopping"],
  ];
  for (const [daysBack, hour, minute, amount, merchant] of spread) {
    spend(daysBack, hour, minute, amount, merchant);
  }
  income(20, 14, 0, 8_500, "FREELANCE CREDIT");
}

// Today at a glance QA pack (all timestamps on day 0):
// • Tied for largest: two ₹8,500 spends at 16:00 / 16:30 — newest row at
//   17:00 is smaller, so the tied pair sits in the recent list with label.
// • Several smaller txs so transactionCount > 3 → "See all N".
// • Mix of in/out so net, in, and out lines are all non-zero.
function seedTodayGlanceEdgeCases(
  spend: (daysBack: number, hour: number, minute: number, amount: number, merchant: string) => void,
  income: (daysBack: number, hour: number, minute: number, amount: number, label: string) => void,
) {
  spend(0, 8, 15, 1_250, "Metro Card Recharge");
  spend(0, 10, 40, 680, "Starbucks Coffee");
  spend(0, 12, 5, 2_150, "Reliance Smart");
  spend(0, 16, 0, 8_500, "Croma Electronics");
  spend(0, 16, 30, 8_500, "Vijay Sales");
  spend(0, 17, 0, 420, "Swiggy");
  income(0, 9, 20, 4_800, "GOOGLE PAY REFUND");
  income(0, 14, 10, 12_000, "NEFT CREDIT ACME CLIENT");
}

export async function seedSampleTransactions(now: Date = new Date()): Promise<{ inserted: number }> {
  const runKey = now.getTime().toString(36);
  const messages = buildSampleMessages(now.getTime(), runKey);
  const result = await ingestSmsBatch(messages, { recordArrival: false });
  await refreshDashboardProjection(now);
  return result;
}
