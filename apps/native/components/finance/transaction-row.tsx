import type { ReactNode } from "react";

import { AppText as Text } from "@/components/app-text";
import { Row } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { moneyFontFamily } from "@/lib/fonts";

// THE transaction row. Home, Transactions and Analytics all render money
// movements through this, so a transaction looks identical everywhere:
// round merchant logo · name / category · amount (income green with "+",
// spending in plain ink — spending is normal, not an error).

export interface TransactionRowLogo {
  letter: string;
  tile: string;
  ink: string;
  img?: string | null;
}

export function TransactionRow({
  name,
  subtitle,
  logo,
  amount,
  amountLabel,
  currency,
  direction,
  meta,
  badge,
  onPress,
}: {
  name: string;
  subtitle?: string;
  logo: TransactionRowLogo;
  /** Raw amount; when absent `amountLabel` is shown as-is. */
  amount?: number | null;
  amountLabel?: string | null;
  currency?: string | null;
  direction?: "income" | "expense" | "neutral" | null;
  /** Small trailing line under the amount (time, "Recurring"). */
  meta?: string;
  /** Optional inline marker after the subtitle (e.g. a Recurring chip). */
  badge?: ReactNode;
  onPress?: () => void;
}) {
  const isIncome = direction === "income";
  const trailing =
    amount !== undefined && amount !== null && currency ? (
      <Money
        value={amount}
        currency={currency}
        size="body"
        tone={isIncome ? "income" : "default"}
        sign={isIncome ? "income" : "none"}
      />
    ) : amountLabel ? (
      <Text
        className={`text-body ${isIncome ? "text-positive" : "text-ink"}`}
        style={{ fontFamily: moneyFontFamily("semibold"), letterSpacing: -0.2 }}
      >
        {amountLabel.replace(/^-\s*/, "").replace(/^\+\s*/, "+")}
      </Text>
    ) : null;

  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${name}${subtitle ? `, ${subtitle}` : ""}`}
      leading={
        <BrandLogo
          letter={logo.letter}
          tile={logo.tile}
          ink={logo.ink}
          img={logo.img ?? undefined}
          size={40}
          radius={20}
          iconRatio={0.6}
        />
      }
      title={name}
      subtitle={
        subtitle || badge ? (
          <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
            {subtitle}
            {badge}
          </Text>
        ) : undefined
      }
      trailing={trailing}
      trailingSubtitle={meta}
    />
  );
}
