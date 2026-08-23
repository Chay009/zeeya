export type PreviewSub = {
  key: string;
  name: string;
  letter: string;
  tile: string;
  ink: string;
  img: string;
  type: "autopay" | "recurring" | "manual";
  typeLabel: string;
  status: "Active" | "Cancelled";
  renew: string;
  amount: string;
  meta: string;
  reactivated?: boolean;
  timeline: { label: string; time: string; dot: string }[];
};

export const previewSubs: PreviewSub[] = [
  {
    key: "netflix",
    name: "Netflix Premium",
    letter: "N",
    tile: "#ffe9ea",
    ink: "#e11",
    img: "https://cdn.simpleicons.org/netflix/E50914",
    type: "autopay",
    typeLabel: "Autopay",
    status: "Active",
    renew: "05 Jun",
    amount: "₹499",
    meta: "Netflix · ₹499 · 05 Jun",
    timeline: [
      { label: "Reactivated", time: "02 Aug 2024, 10:24 AM", dot: "#8e61bf" },
      { label: "Cancelled", time: "14 Jul 2024, 6:12 PM", dot: "#a8a59b" },
      { label: "Started", time: "05 Jan 2024, 9:00 AM", dot: "#2f9d70" },
    ],
  },
  {
    key: "amazon",
    name: "Amazon Prime",
    letter: "A",
    tile: "#fff0d6",
    ink: "#c76e00",
    img: "https://cdn.simpleicons.org/amazon/FF9900",
    type: "autopay",
    typeLabel: "Autopay",
    status: "Active",
    renew: "12 Jun",
    amount: "₹299",
    meta: "Amazon · ₹299 · 12 Jun",
    reactivated: true,
    timeline: [
      { label: "Reactivated", time: "30 Jun 2024, 3:15 PM", dot: "#8e61bf" },
      { label: "Cancelled", time: "01 Apr 2024, 8:05 PM", dot: "#a8a59b" },
      { label: "Started", time: "15 Feb 2023, 11:30 AM", dot: "#2f9d70" },
    ],
  },
  {
    key: "spotify",
    name: "Spotify",
    letter: "S",
    tile: "#e0f7e9",
    ink: "#17994a",
    img: "https://cdn.simpleicons.org/spotify/1DB954",
    type: "recurring",
    typeLabel: "Recurring",
    status: "Active",
    renew: "18 Jun",
    amount: "₹119",
    meta: "Spotify · ₹119 · 18 Jun",
    timeline: [
      { label: "Amount updated", time: "22 May 2024, 4:30 PM", dot: "#b1843d" },
      { label: "Started", time: "03 Mar 2023, 7:00 PM", dot: "#2f9d70" },
    ],
  },
  {
    key: "youtube",
    name: "YouTube Premium",
    letter: "Y",
    tile: "#eee4fb",
    ink: "#8e61bf",
    img: "https://cdn.simpleicons.org/youtube/FF0000",
    type: "manual",
    typeLabel: "Added by me",
    status: "Active",
    renew: "25 Jun",
    amount: "₹149",
    meta: "YouTube · ₹149 · 25 Jun",
    timeline: [{ label: "Started", time: "18 Jan 2024, 1:20 PM", dot: "#2f9d70" }],
  },
  {
    key: "disney",
    name: "Disney+ Hotstar",
    letter: "D",
    tile: "#f0ede9",
    ink: "#8a8378",
    img: "https://cdn.simpleicons.org/disneyplus/00C7F0",
    type: "autopay",
    typeLabel: "Autopay",
    status: "Cancelled",
    renew: "—",
    amount: "₹299",
    meta: "Disney+ · ₹299 · Cancelled",
    timeline: [
      { label: "Cancelled", time: "14 Jul 2024, 6:12 PM", dot: "#a8a59b" },
      { label: "Active", time: "10 Jan 2024, 9:40 AM", dot: "#2f9d70" },
      { label: "Started", time: "05 Mar 2023, 7:15 PM", dot: "#2f9d70" },
    ],
  },
];

// [incomeHeight, expenseHeight] in px, mirroring the web prototype's bars.
export const flowBars: [number, number][] = [
  [56, 30],
  [76, 48],
  [103, 36],
  [68, 64],
  [84, 43],
  [66, 52],
  [91, 38],
];

export const flowDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarMonth = {
  label: string;
  spent: string;
  income: string;
  offset: number;
  days: number;
  today?: number;
  nets: Record<number, string>;
};

export const calendarMonths: CalendarMonth[] = [
  {
    label: "Mar 2024",
    spent: "₹88,400",
    income: "+₹5,10,000",
    offset: 4,
    days: 31,
    nets: {
      4: "-₹320",
      6: "-₹60",
      8: "+2L",
      11: "-₹450",
      14: "-2.2K",
      18: "-5K",
      20: "+80K",
      22: "-₹740",
      25: "-₹900",
      28: "-3.4K",
    },
  },
  {
    label: "Apr 2024",
    spent: "₹91,120",
    income: "+₹5,10,000",
    offset: 0,
    days: 30,
    nets: {
      2: "-₹299",
      5: "-10K",
      8: "+50K",
      10: "-₹149",
      13: "-₹320",
      16: "-2.2K",
      19: "+2L",
      23: "-₹450",
      26: "-₹900",
      29: "-3.4K",
    },
  },
  {
    label: "May 2024",
    spent: "₹1,35,200",
    income: "+₹5,10,000",
    offset: 2,
    today: 23,
    days: 31,
    nets: {
      1: "-₹450",
      3: "-₹1,200",
      5: "+2L",
      6: "-₹60",
      8: "-10K",
      10: "+80K",
      13: "-₹320",
      14: "-2.2K",
      15: "+50K",
      17: "-5K",
      19: "-₹740",
      22: "-₹900",
      23: "-₹1,280",
      25: "-₹620",
      27: "+1.5L",
      29: "-3.4K",
    },
  },
  {
    label: "Jun 2024",
    spent: "₹96,480",
    income: "+₹5,10,000",
    offset: 5,
    days: 30,
    nets: {
      1: "-₹450",
      4: "-₹299",
      6: "-₹60",
      8: "+2L",
      11: "-₹119",
      13: "-5K",
      15: "+80K",
      18: "-₹740",
      20: "-2.2K",
      22: "-₹320",
      25: "+50K",
      27: "-₹900",
      29: "-3.4K",
    },
  },
  {
    label: "Jul 2024",
    spent: "₹1,02,150",
    income: "+₹4,90,000",
    offset: 0,
    days: 31,
    nets: {
      2: "-₹620",
      5: "-₹499",
      9: "+2L",
      12: "-10K",
      16: "-₹149",
      19: "+1.5L",
      23: "-₹450",
      26: "-2.2K",
      30: "-₹320",
    },
  },
];

export const categories = [
  { label: "Household", amount: "₹1,280", color: "#8e61bf", pct: "100%" },
  { label: "Groceries", amount: "₹980", color: "#d77863", pct: "77%" },
  { label: "Food & dining", amount: "₹620", color: "#b77f1d", pct: "48%" },
  { label: "Subscriptions", amount: "₹499", color: "#2f9d70", pct: "39%" },
];

export type ActivityItem = {
  letter: string;
  tile: string;
  ink: string;
  img: string;
  bar: string;
  name: string;
  sub: string;
  amount: string;
};

export const activityItems: ActivityItem[] = [
  {
    letter: "S",
    tile: "#fff0bf",
    ink: "#b77f1d",
    img: "https://cdn.simpleicons.org/swiggy/FC8019",
    bar: "#c76e00",
    name: "Swiggy",
    sub: "Food & dining · 09:32 AM",
    amount: "−₹620",
  },
  {
    letter: "N",
    tile: "#e0f3e6",
    ink: "#e11",
    img: "https://cdn.simpleicons.org/netflix/E50914",
    bar: "#8e61bf",
    name: "Netflix Premium",
    sub: "Subscription · 08:10 AM",
    amount: "−₹499",
  },
  {
    letter: "F",
    tile: "#eee4fb",
    ink: "#2874f0",
    img: "https://cdn.simpleicons.org/flipkart/2874F0",
    bar: "#d05b51",
    name: "Flipkart Retail",
    sub: "Household · Yesterday",
    amount: "−₹1,280",
  },
];
