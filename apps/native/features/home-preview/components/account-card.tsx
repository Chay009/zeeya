import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { moneyFontFamily } from "@/lib/fonts";
import type { HomeAccount } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

const CARD_ASPECT = 1.586; // ISO/IEC 7810 ID-1 — the physical credit-card ratio.

const cardShadow = Platform.select({
  ios: {
    shadowColor: hp.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
  },
  android: { elevation: 14 },
  default: {},
});

// REPORTED/CALCULATED/TRACKING are real, different trust levels (see
// account-presentation.ts): a bank-confirmed figure, a locally-estimated
// one, and no real balance at all. On the card that distinction is a single
// dot next to the balance — the full wording lives in the detail below,
// where there's room for it.
const STATUS_DOTS: Record<string, string> = {
  REPORTED: "#4ade80",
  CALCULATED: "#fbbf24",
  TRACKING: "rgba(255,255,255,0.5)",
};

// --- brand colour maths -----------------------------------------------------
// The card's whole identity is HomeAccount.bankColor (SBI blue, HDFC navy,
// Kotak red...). Everything painted on the card is derived from that one
// value, so an HDFC card and an SBI card are genuinely different objects
// rather than the same dark rectangle with a different name on it.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const int = Number.parseInt(full.slice(0, 6) || "000000", 16);
  if (Number.isNaN(int)) return { r: 20, g: 20, b: 25 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) =>
    Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Pale brand colours (ICICI orange, Baroda orange) would leave white text
// unreadable, so anything above this luminance gets pushed darker before it
// becomes a surface.
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function surfaceFor(brand: string): string {
  const luminance = relativeLuminance(brand);
  if (luminance > 0.62) return shade(brand, -0.55);
  if (luminance > 0.45) return shade(brand, -0.32);
  return brand;
}

// --- card furniture ---------------------------------------------------------

// The brand-coloured plastic: a diagonal gradient from a lifted top-left to
// a deepened bottom-right, plus a soft off-card highlight ellipse. This is
// what gives the surface depth instead of the flat fill it had before.
function CardSurface({ base, width, height }: { base: string; width: number; height: number }) {
  const light = shade(base, 0.2);
  const dark = shade(base, -0.42);

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0"
    >
      <Defs>
        <LinearGradient id="plastic" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.52" stopColor={base} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
        <LinearGradient id="sheen" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width={width} height={height} fill="url(#plastic)" />
      {/* Two large overlapping ellipses read as the moulded curve of real
          card plastic catching the light. */}
      <Ellipse
        cx={width * 0.82}
        cy={height * 1.02}
        rx={width * 0.62}
        ry={height * 0.62}
        fill="#000000"
        opacity={0.16}
      />
      <Ellipse
        cx={width * 0.12}
        cy={-height * 0.12}
        rx={width * 0.55}
        ry={height * 0.7}
        fill="url(#sheen)"
      />
    </Svg>
  );
}

// A real EMV contact plate — gold, with the contact traces cut into it.
// This single graphic is most of what separates "a card" from "a rectangle".
function Chip({ size = 34 }: { size?: number }) {
  const height = size * 0.76;
  return (
    <Svg width={size} height={height} viewBox="0 0 34 26">
      <Defs>
        <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f7e3a1" />
          <Stop offset="0.45" stopColor="#d9b45e" />
          <Stop offset="1" stopColor="#b08c37" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="34" height="26" rx="5" fill="url(#gold)" />
      <G stroke="rgba(120,88,20,0.55)" strokeWidth="1.1" fill="none">
        <Path d="M0 9 H11" />
        <Path d="M0 17 H11" />
        <Path d="M23 9 H34" />
        <Path d="M23 17 H34" />
        <Path d="M11 4 V22" />
        <Path d="M23 4 V22" />
        <Path d="M11 13 H23" />
      </G>
    </Svg>
  );
}

// The contactless mark: four nested arcs, the way it's printed on a card.
function ContactlessMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke="rgba(255,255,255,0.75)" strokeWidth="1.9" fill="none" strokeLinecap="round">
        <Path d="M7 8.5a6.5 6.5 0 0 1 0 7" />
        <Path d="M11 6a10.5 10.5 0 0 1 0 12" />
        <Path d="M15 3.5a14.5 14.5 0 0 1 0 17" />
      </G>
    </Svg>
  );
}

export function AccountCard({
  account,
  defaultExpanded = false,
}: {
  account: HomeAccount;
  // Home shows this card as its one hero element among several other
  // sections, so the reported-balance/captured-change/income-expense/
  // reconciliation detail stays collapsed behind a toggle there. Cards is
  // the dedicated account-depth screen, so it defaults expanded — same
  // component, no duplicated markup for the two contexts.
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [width, setWidth] = useState(0);
  const hasSecondaryDetail =
    Boolean(account.capturedChange) ||
    Boolean(account.reconciliation) ||
    Boolean(account.unassignedNote);

  const base = surfaceFor(account.bankColor || hp.heroSurface);
  const cardHeight = width > 0 ? Math.round(width / CARD_ASPECT) : 208;

  return (
    <View>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        className="justify-between overflow-hidden rounded-hero p-[22px]"
        style={{ backgroundColor: base, height: cardHeight, ...cardShadow }}
      >
        {width > 0 && <CardSurface base={base} width={width} height={cardHeight} />}

        <View className="flex-row items-start justify-between">
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <BrandLogo
              letter={account.bankName.charAt(0).toUpperCase() || "?"}
              tile="rgba(255,255,255,0.95)"
              ink={base}
              img={account.bankIcon}
              size={36}
              radius={11}
              iconRatio={0.68}
            />
            <Text numberOfLines={1} className="flex-1 text-subtitle font-bold tracking-tight text-white">
              {account.bankName}
            </Text>
          </View>
          <ContactlessMark />
        </View>

        <View className="flex-row items-center gap-3">
          <Chip />
          <Text className="text-subtitle font-semibold tracking-[2.5px] text-white/70">
            ••••  {account.last4}
          </Text>
        </View>

        <View className="flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              className="text-[40px] tracking-tighter text-white"
              style={{ fontFamily: moneyFontFamily("semibold") }}
            >
              {account.balance}
            </Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: STATUS_DOTS[account.status] ?? "rgba(255,255,255,0.5)" }}
              />
              <Text numberOfLines={1} className="flex-1 text-caption text-white/70">
                {account.balanceMeta ?? account.status.toLowerCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {hasSecondaryDetail && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            hitSlop={8}
            className="mt-3.5 flex-row items-center gap-1 self-start rounded-pill bg-card px-3.5 py-2"
          >
            <Text className="text-[13px] font-bold text-ink">
              {expanded ? "Hide details" : "Details"}
            </Text>
            <AppIcon name={expanded ? "chevron-up" : "chevron-down"} size={12} color={hp.ink} />
          </Pressable>

          {expanded && (
            <View className="mt-2.5 gap-4 rounded-card bg-card p-[18px]">
              {account.capturedChange && (
                <View className="flex-row gap-4">
                  {account.reportedBalance && account.reportedMeta && (
                    <CardStat
                      label="Bank reported"
                      value={account.reportedBalance}
                      note={account.reportedMeta}
                    />
                  )}
                  <CardStat
                    label="Captured change"
                    value={account.capturedChange}
                    note={`${account.capturedTransactionCount} transaction${
                      account.capturedTransactionCount === 1 ? "" : "s"
                    }`}
                  />
                </View>
              )}

              {account.capturedIncome && account.capturedExpense && (
                <View className="flex-row gap-4">
                  <CardStat label="Added" value={account.capturedIncome} tone="text-positive" />
                  <CardStat label="Spent" value={account.capturedExpense} tone="text-negative" />
                </View>
              )}

              {account.reconciliation && (
                <Text className="text-[13px] leading-[19px] text-muted">{account.reconciliation}</Text>
              )}
              {account.unassignedNote && (
                <Text className="text-[13px] leading-[19px] text-muted">{account.unassignedNote}</Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function CardStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-caption text-muted-soft">{label}</Text>
      <Text numberOfLines={1} className={`mt-0.5 text-[19px] font-extrabold ${tone ?? "text-ink"}`}>
        {value}
      </Text>
      {note ? (
        <Text numberOfLines={1} className="mt-0.5 text-caption text-faint">
          {note}
        </Text>
      ) : null}
    </View>
  );
}
