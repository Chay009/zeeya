import { logoUrlForDomain } from "../../../lib/logo-dev";
import type { ParsedSms } from "../../../lib/sms";

export type VisualStyle = {
  tile: string;
  ink: string;
  bar: string;
  img?: string;
};

const knownBrandStyles: { match: string; domain: string; style: VisualStyle }[] = [
  {
    match: "netflix",
    domain: "netflix.com",
    style: { tile: "#ffe9ea", ink: "#e11", bar: "#8e61bf" },
  },
  {
    match: "amazon",
    domain: "amazon.com",
    style: { tile: "#fff0d6", ink: "#c76e00", bar: "#c76e00" },
  },
  {
    match: "spotify",
    domain: "spotify.com",
    style: { tile: "#e0f7e9", ink: "#17994a", bar: "#2f9d70" },
  },
  {
    match: "youtube",
    domain: "youtube.com",
    style: { tile: "#eee4fb", ink: "#8e61bf", bar: "#8e61bf" },
  },
  {
    match: "disney",
    domain: "disneyplus.com",
    style: { tile: "#f0ede9", ink: "#8a8378", bar: "#a8a59b" },
  },
  {
    match: "swiggy",
    domain: "swiggy.com",
    style: { tile: "#fff0bf", ink: "#b77f1d", bar: "#c76e00" },
  },
  {
    match: "flipkart",
    domain: "flipkart.com",
    style: { tile: "#eee4fb", ink: "#2874f0", bar: "#d05b51" },
  },
];

const knownBankStyles: { match: string; domain: string; style: VisualStyle }[] = [
  {
    match: "state bank of india",
    domain: "sbi.co.in",
    style: { tile: "#e8f0ff", ink: "#1e5aa8", bar: "#1e5aa8" },
  },
  {
    match: "kotak",
    domain: "kotak.com",
    style: { tile: "#fff0f0", ink: "#ed1b2e", bar: "#ed1b2e" },
  },
  {
    match: "hdfc",
    domain: "hdfcbank.com",
    style: { tile: "#e9f0ff", ink: "#004c8f", bar: "#004c8f" },
  },
  {
    match: "icici",
    domain: "icicibank.com",
    style: { tile: "#fff0e4", ink: "#f58220", bar: "#f58220" },
  },
  {
    match: "axis",
    domain: "axisbank.com",
    style: { tile: "#f8eaf2", ink: "#97144d", bar: "#97144d" },
  },
  {
    match: "bank of baroda",
    domain: "bankofbaroda.in",
    style: { tile: "#fff0e4", ink: "#f36f21", bar: "#f36f21" },
  },
];

// One hue per category, each distinct from the others and from the violet
// accent (which means "interactive", never "a category"). `travel` and
// `bill` previously shared the same emerald, so two different categories
// drew the same colour in every chart.
const categoryStyles: { match: string; style: VisualStyle }[] = [
  { match: "food", style: { tile: "#fff4e5", ink: "#b25e09", bar: "#f5a524" } },
  { match: "grocer", style: { tile: "#ffeceb", ink: "#c62a2f", bar: "#e5484d" } },
  { match: "travel", style: { tile: "#e6f4ff", ink: "#0072d6", bar: "#0090ff" } },
  { match: "house", style: { tile: "#efeaff", ink: "#5836e0", bar: "#8b6dff" } },
  { match: "bill", style: { tile: "#eaf7ef", ink: "#0e8442", bar: "#12a150" } },
];

// Anything the parser hasn't labelled yet. Teal, not grey: these are
// ordinary transactions that simply have no category name, and grey reads
// as disabled or failed.
export const fallbackVisualStyle: VisualStyle = {
  tile: "#e3f5f2",
  ink: "#0f7a6d",
  bar: "#12a594",
};

export function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const amount = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

export function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

export function merchantName(message: ParsedSms): string {
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

export function visualStyleFor(name: string, category?: string | null): VisualStyle {
  const value = normalized(name);
  const knownBrand = knownBrandStyles.find((entry) => value.includes(entry.match));
  const categoryStyle = categoryStyles.find((entry) =>
    normalized(category ?? "").includes(entry.match),
  );
  const base = knownBrand?.style ?? categoryStyle?.style ?? fallbackVisualStyle;
  const dynamicImg = knownBrand ? logoUrlForDomain(knownBrand.domain) : null;
  return dynamicImg ? { ...base, img: dynamicImg } : base;
}

export function merchantVisual(name: string, category?: string | null): VisualStyle {
  return visualStyleFor(name, category);
}

export function bankVisualFor(name: string): VisualStyle {
  const value = normalized(name);
  const knownBank = knownBankStyles.find((entry) => value.includes(entry.match));
  const base = knownBank?.style ?? fallbackVisualStyle;
  const dynamicImg = knownBank ? logoUrlForDomain(knownBank.domain) : null;
  return dynamicImg ? { ...base, img: dynamicImg } : base;
}

export function subscriptionVisual(name: string): VisualStyle {
  return visualStyleFor(name, "subscriptions");
}

