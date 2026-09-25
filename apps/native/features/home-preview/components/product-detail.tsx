// The lightweight product detail screen for the bounded-read-model path
// (Phase 1B.4 sub-slice 5). Renders the SQL-backed TransactionDetail/
// ActivityDetail DTOs via features/home-preview/data.ts's
// productDetailSections — every field allowedlist is explicitly excluded
// from the raw SMS body, grammar tags, and the parser's token tree, so
// this can never accidentally become a parser-debug surface (that's the
// still-separate, dev-only legacy TransactionDetail route, which Phase
// 1C replaces).
import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { ScreenToolbar } from "@/components/native-ui/screen-toolbar";
import { ZoomTransition } from "@/components/native-ui/zoom-transition";

import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";
import { productDetailSections, type DetailSection } from "@/features/home-preview/data";

import { GhostLine } from "./home-highlights/shared";
import { BrandLogo } from "./brand-logo";
import { previewEyebrowStyle } from "./subscription-ui";
import { hp } from "../theme";

/** Static ghost layout while a detail route resolves from SQLite. */
export function ProductDetailLoading({ topInset }: { topInset: number }) {
  return (
    <View className="flex-1 bg-background px-5" style={{ paddingTop: topInset }}>
      <View className="mt-4 gap-3">
        <GhostLine width={88} height={12} />
        <GhostLine width={120} height={28} />
      </View>
      <View className="mt-6 gap-3 rounded-card bg-card p-5">
        <GhostLine width={180} height={20} />
        <GhostLine width={240} height={12} />
        <GhostLine width={200} height={12} />
      </View>
    </View>
  );
}

// Re-export productDetailSections for routes that only consume this one
// helper — saves them from reaching into data.ts separately.
export { productDetailSections };

export interface ProductDetailHeader {
  title: string;
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  sub: string;
  amount: string | null;
  direction: "income" | "expense" | "neutral";
  // When set, shows a small "DEVELOPMENT" warning banner like the legacy
  // parser-dump screen does — reserved for sub-slice-5's two lightweight
  // routes that share the same look. The two new routes here intentionally
  // omit this — the new detail screens ARE the product surface, not a
  // debug dump, so no banner is rendered for them.
  developmentBanner?: string;
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
  return (
    <ZoomTransition style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenToolbar
          eyebrow={eyebrow}
          title={header.title}
          topInset={topInset}
          onBack={onBack}
          backLabel={`Back from ${eyebrow.toLowerCase()}`}
          style={{ marginHorizontal: -20 }}
        />

        <View
          style={{
            marginTop: 20,
            borderRadius: 27,
            borderWidth: 1,
            borderColor: hp.border,
            backgroundColor: "rgba(255,255,255,0.8)",
            padding: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <BrandLogo
              letter={header.letter}
              tile={header.tile}
              ink={header.ink}
              img={header.img}
              size={48}
              radius={16}
              iconRatio={0.66}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "800", color: hp.ink }}>
                {header.title}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: hp.mutedSoft }}>{header.sub}</Text>
            </View>
            {header.amount && (
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: header.direction === "income" ? hp.emeraldDeep : hp.coral,
                }}
              >
                {header.amount}
              </Text>
            )}
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={{ marginTop: 24 }}>
            <Text style={previewEyebrowStyle}>{section.title.toUpperCase()}</Text>
            <View
              style={{
                marginTop: 10,
                borderRadius: 18,
                borderWidth: 1,
                borderTopColor: hp.border,
                borderColor: hp.border,
                backgroundColor: "rgba(255,255,255,0.72)",
                overflow: "hidden",
              }}
            >
              {section.rows.map((row, index) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    padding: 14,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: hp.border,
                  }}
                >
                  <Text
                    style={{ width: 120, fontSize: 11, fontWeight: "700", color: hp.mutedSoft }}
                  >
                    {row.label}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: hp.ink }}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </ZoomTransition>
  );
}

// Header builder for a transaction-detail route — converts a SQL-backed
// TransactionDetail into the rendering header fields above.
export function transactionDetailHeader(detail: {
  brandName: string | null;
  vendor: string | null;
  date: number;
  amountMinorUnits: number;
  currency: string;
  direction: "income" | "expense" | "neutral";
}): ProductDetailHeader {
  const name = (detail.brandName?.trim() || detail.vendor?.trim() || "Transaction") as string;
  const amountText = formatMoney(
    fromMinorUnits(detail.amountMinorUnits, detail.currency),
    detail.currency,
  );
  const amount =
    detail.direction === "income"
      ? `+${amountText}`
      : detail.direction === "expense"
        ? `−${amountText}`
        : amountText;
  return {
    title: name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: "#e3f5f2",
    ink: "#0f7a6d",
    sub: new Date(detail.date).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    amount,
    direction: detail.direction,
  };
}

// Header builder for an activity-detail route — null-aware variant since
// ActivityDetail fields like amountMinorUnits/currency/direction are
// themselves null for non-financial messages.
export function activityDetailHeader(detail: {
  brandName: string | null;
  vendor: string | null;
  date: number;
  amountMinorUnits: number | null;
  currency: string | null;
  direction: "income" | "expense" | "neutral" | null;
}): ProductDetailHeader {
  const name = (detail.brandName?.trim() || detail.vendor?.trim() || "Activity") as string;
  let amount: string | null = null;
  if (detail.amountMinorUnits !== null && detail.currency !== null && detail.direction) {
    const amountText = formatMoney(
      fromMinorUnits(detail.amountMinorUnits, detail.currency),
      detail.currency,
    );
    amount =
      detail.direction === "income"
        ? `+${amountText}`
        : detail.direction === "expense"
          ? `−${amountText}`
          : amountText;
  }
  return {
    title: name,
    letter: name.charAt(0).toUpperCase() || "?",
    tile: "#e3f5f2",
    ink: "#0f7a6d",
    sub: new Date(detail.date).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    amount,
    direction: detail.direction ?? "neutral",
  };
}
