import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import type { HomeDetectedAccount, HomeUnassignedReading } from "../data";
import { hp } from "../theme";
import { BankIconPattern } from "./bank-icon-pattern";
import { BrandLogo } from "./brand-logo";

function DetectedAccountRow({ account }: { account: HomeDetectedAccount }) {
  return (
    <View className="relative overflow-hidden rounded-tile border border-border bg-card p-3.5">
      <BankIconPattern uri={account.bankIcon} />
      <View className="flex-row items-center gap-2.5">
        <BrandLogo
          letter={account.bankName.charAt(0).toUpperCase() || "?"}
          tile={hp.accentSoft}
          ink={hp.accentDeep}
          img={account.bankIcon}
          size={34}
          radius={17}
          iconRatio={0.68}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-body font-extrabold text-ink">
            {account.bankName}
          </Text>
          <Text className="mt-0.5 text-caption text-muted">
            •••• {account.last4} · {account.currency}
          </Text>
        </View>
        <View className="rounded-pill bg-accent-soft px-2 py-1">
          <Text className="text-label font-extrabold text-accent-deep">DETECTED</Text>
        </View>
      </View>

      <View className="mt-3 border-t border-border-soft pt-2.5">
        <View className="flex-row items-center gap-1.5">
          <AppIcon name="file" size={14} color={hp.accentDeep} />
          <Text className="text-meta font-extrabold text-ink-soft">{account.evidenceType}</Text>
        </View>
        <Text className="mt-1 text-label text-muted">
          {account.evidenceDate} · {account.evidenceSource}
        </Text>
        <Text className="mt-2 text-meta leading-4 text-muted">{account.note}</Text>
      </View>
    </View>
  );
}

function UnassignedReadingRow({ reading }: { reading: HomeUnassignedReading }) {
  return (
    <View className="relative overflow-hidden rounded-tile border border-border bg-card p-3.5">
      <BankIconPattern uri={reading.bankIcon} />
      <View className="flex-row items-center gap-2.5">
        <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-surface-muted">
          <AppIcon name="help" size={16} color={hp.muted} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-subtitle font-extrabold text-ink">
            {reading.bankName}
          </Text>
          <Text className="mt-0.5 text-label text-muted">Bank reading without account digits</Text>
        </View>
        <Text numberOfLines={1} className="text-body font-extrabold text-ink">
          {reading.balance}
        </Text>
      </View>
      <Text className="mt-2 text-label text-muted">
        {reading.evidenceDate} · {reading.evidenceSource}
      </Text>
      <Text className="mt-1.5 text-label leading-[15px] text-muted">{reading.note}</Text>
    </View>
  );
}

export function AccountEvidenceSection({
  detectedAccounts,
  unassignedReadings,
}: {
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
}) {
  if (detectedAccounts.length === 0 && unassignedReadings.length === 0) return null;

  const countLabel =
    detectedAccounts.length === 1
      ? "1 identity"
      : detectedAccounts.length > 1
        ? `${detectedAccounts.length} identities`
        : `${unassignedReadings.length} reading${unassignedReadings.length === 1 ? "" : "s"}`;

  return (
    <View className="mt-6">
      <View className="flex-row items-end justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-label font-bold tracking-widest text-muted">
            OTHER ACCOUNT SIGNALS
          </Text>
          <Text className="mt-1 text-title font-extrabold tracking-tight text-ink">
            Detected accounts
          </Text>
        </View>
        <Text className="text-meta font-bold text-accent-deep">{countLabel}</Text>
      </View>

      <View className="mt-2.5 flex-row items-start gap-2 rounded-tile bg-notice-bg p-3">
        <AppIcon name="info" size={16} color={hp.noticeInk} />
        <Text className="flex-1 text-meta leading-4 text-notice-ink">
          These are identity signals only. A bank-reported balance is required before an account
          appears in balances or net across accounts.
        </Text>
      </View>

      <View className="mt-2.5 gap-2">
        {detectedAccounts.map((account) => (
          <DetectedAccountRow key={account.key} account={account} />
        ))}
      </View>

      {unassignedReadings.length > 0 && (
        <View className="mt-4">
          <Text className="text-meta font-extrabold text-ink-soft">
            Bank readings without an account identity
          </Text>
          <View className="mt-2 gap-2">
            {unassignedReadings.map((reading) => (
              <UnassignedReadingRow key={reading.key} reading={reading} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
