import { Chip } from "heroui-native";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { NavBar } from "@/components/ui/header";
import { DetailRow, RowGroup } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import { Delayed, EmptyState, SkeletonBlock } from "@/components/ui/states";
import { headingFontFamily } from "@/lib/fonts";
import { dateFormat } from "@/lib/intl-format";

import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { merchantVisual, productDetailSections, type DetailSection } from "@/features/home-preview/data";

import { BrandLogo } from "./brand-logo";

// Transaction / activity detail. Receipt-style: who, how much, when — big
// and centred — then the facts in grouped rows. Every state (loading, not
// found, error) keeps the back button, so there is no dead end.

export { productDetailSections };

export interface ProductDetailHeader {
  title: string;
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  sub: string;
  amount: string | null;
  amountValue: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral";
  category: string | null;
  overview: { label: string; value: string }[];
}

export function ProductDetailLoading({ topInset, onBack }: { topInset: number; onBack?: () => void }) {
  return (
    <View className="flex-1 bg-background">
      <NavBar topInset={topInset} onBack={onBack} />
      <Delayed>
        <View className="items-center px-5 pt-6">
          <SkeletonBlock className="h-16 w-16 rounded-full" />
          <SkeletonBlock className="mt-4 h-4 w-32" />
          <SkeletonBlock className="mt-3 h-10 w-40" />
          <SkeletonBlock className="mt-3 h-3.5 w-36" />
        </View>
        <View className="mx-4 mt-10 gap-4 rounded-card bg-card p-4">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="h-4 w-3/5" />
        </View>
      </Delayed>
    </View>
  );
}

export function ProductDetailMessage({
  topInset,
  onBack,
  title,
  body,
}: {
  topInset: number;
  onBack: () => void;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-1 bg-background">
      <NavBar topInset={topInset} onBack={onBack} />
      <View className="flex-1 justify-center pb-24">
        <EmptyState icon="receipt" title={title} body={body} actionLabel="Go back" onAction={onBack} />
      </View>
    </View>
  );
}

export function ProductDetail({
  eyebrow,
  header,
  sections,
  onBack,
  topInset,
}: {
  eyebrow: string;
  header: ProductDetailHeader;
  sections: DetailSection[];
  onBack: () => void;
  topInset: number;
}) {
  const isIncome = header.direction === "income";
  const visibleSections = sections.filter((section) => section.rows.length > 0);

  // No entrance choreography of its own: the stack's native transition is
  // the entrance. A full-screen zoom + logo spring + staggered fades used to
  // play on top of it, on the same frames the screen was mounting.
  return (
    <View style={{ flex: 1 }}>
      <View className="flex-1 bg-background">
        <NavBar topInset={topInset} onBack={onBack} title={eyebrow} />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center px-4 pb-2 pt-4">
            <BrandLogo
              letter={header.letter}
              tile={header.tile}
              ink={header.ink}
              img={header.img}
              size={64}
              radius={32}
              iconRatio={0.6}
            />
            <Text
              numberOfLines={2}
              className="mt-4 text-center text-subtitle font-semibold text-ink"
              style={{ fontFamily: headingFontFamily("semibold") }}
            >
              {header.title}
            </Text>
            {header.amountValue !== null && header.currency ? (
              <Money
                value={header.amountValue}
                currency={header.currency}
                size="display"
                tone={isIncome ? "income" : "default"}
                sign={isIncome ? "income" : "none"}
                className="mt-2"
              />
            ) : null}
            <View className="items-center">
              <Text className="mt-2 text-caption text-muted">{header.sub}</Text>
              {header.category ? (
                <Chip variant="secondary" size="sm" className="mt-4 rounded-pill px-3">
                  <Text className="text-meta font-semibold text-ink-soft">{header.category}</Text>
                </Chip>
              ) : null}
            </View>
          </View>

          {header.overview.length > 0 ? (
            <Section>
              <RowGroup inset={16}>
                {header.overview.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} />
                ))}
              </RowGroup>
            </Section>
          ) : null}

          {visibleSections.map((section) => (
            <Section key={section.title} title={section.title}>
              <RowGroup inset={16}>
                {section.rows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} />
                ))}
              </RowGroup>
            </Section>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function whenLabel(ms: number): string {
  return `${dateFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(ms)} · ${dateFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(ms)}`;
}

function signedAmount(
  amountMinorUnits: number,
  currency: string,
  direction: "income" | "expense" | "neutral",
): string {
  const text = formatMoney(fromMinorUnits(amountMinorUnits, currency), currency);
  return direction === "income" ? `+${text}` : direction === "expense" ? `−${text}` : text;
}

function overviewRows(detail: {
  bankName: string | null;
  ref?: string | null;
  trxTypeRich: string | null;
  direction: "income" | "expense" | "neutral" | null;
}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (detail.direction && detail.direction !== "neutral") {
    rows.push({ label: "Type", value: detail.direction === "income" ? "Money in" : "Money out" });
  }
  if (detail.bankName) rows.push({ label: "Account", value: detail.bankName });
  if (detail.trxTypeRich) rows.push({ label: "Method", value: titleCase(detail.trxTypeRich) });
  if (detail.ref) rows.push({ label: "Reference", value: detail.ref });
  return rows;
}

export function transactionDetailHeader(detail: {
  brandName: string | null;
  vendor: string | null;
  date: number;
  amountMinorUnits: number;
  currency: string;
  direction: "income" | "expense" | "neutral";
  category?: string | null;
  bankName: string | null;
  ref?: string | null;
  trxTypeRich: string | null;
}): ProductDetailHeader {
  const name = detail.brandName?.trim() || detail.vendor?.trim() || "Transaction";
  const visual = merchantVisual(name, detail.category ?? null);
  return {
    title: name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: visual.tile,
    ink: visual.ink,
    img: visual.img,
    sub: whenLabel(detail.date),
    amount: signedAmount(detail.amountMinorUnits, detail.currency, detail.direction),
    amountValue: fromMinorUnits(detail.amountMinorUnits, detail.currency),
    currency: detail.currency,
    direction: detail.direction,
    category: detail.category ? titleCase(detail.category) : null,
    overview: overviewRows(detail),
  };
}

export function activityDetailHeader(detail: {
  brandName: string | null;
  vendor: string | null;
  date: number;
  amountMinorUnits: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral" | null;
  category?: string | null;
  bankName: string | null;
  ref?: string | null;
  trxTypeRich: string | null;
}): ProductDetailHeader {
  const name = detail.brandName?.trim() || detail.vendor?.trim() || "Activity";
  const visual = merchantVisual(name, detail.category ?? null);
  const hasAmount = detail.amountMinorUnits !== null && detail.currency !== null && detail.direction !== null;
  return {
    title: name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: visual.tile,
    ink: visual.ink,
    img: visual.img,
    sub: whenLabel(detail.date),
    amount: hasAmount
      ? signedAmount(detail.amountMinorUnits!, detail.currency!, detail.direction!)
      : null,
    amountValue: hasAmount ? fromMinorUnits(detail.amountMinorUnits!, detail.currency!) : null,
    currency: detail.currency,
    direction: detail.direction ?? "neutral",
    category: detail.category ? titleCase(detail.category) : null,
    overview: overviewRows(detail),
  };
}
