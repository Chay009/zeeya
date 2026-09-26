import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import type { HomeDetectedAccount, HomeUnassignedReading } from "../data";
import { useThemeColors } from "@/components/ui/theme";
import { BankIconPattern } from "./bank-icon-pattern";
import { BrandLogo } from "./brand-logo";

function DetectedAccountRow({ account }: { account: HomeDetectedAccount }) {
  const colors = useThemeColors();
  return (
    <View className="relative overflow-hidden rounded-tile border border-border bg-card p-3.5">
      <BankIconPattern uri={account.bankIcon} />
      <View className="flex-row items-center gap-2.5">
        <BrandLogo
          letter={account.bankName.charAt(0).toUpperCase() || "?"}
          tile={colors.accentSoft}
          ink={colors.accentDeep}
          img={account.bankIcon}
          size={34}
          radius={17}
          iconRatio={0.68}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-body font-semibold text-ink">
            {account.bankName}
          </Text>
          <Text className="mt-0.5 text-caption text-muted">
            •••• {account.last4} · {account.currency}
          </Text>
        </View>
        <View className="rounded-pill bg-accent-soft px-2 py-1">
          <Text className="text-label font-semibold text-accent-deep">DETECTED</Text>
        </View>
      </View>

      <View className="mt-3 border-t border-divider pt-2.5">
        <View className="flex-row items-center gap-1.5">
          <AppIcon name="file" size={14} color={colors.accentDeep} />
          <Text className="text-meta font-semibold text-ink-soft">{account.evidenceType}</Text>
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
  const colors = useThemeColors();
  return (
    <View className="relative overflow-hidden rounded-tile border border-border bg-card p-3.5">
      <BankIconPattern uri={reading.bankIcon} />
      <View className="flex-row items-center gap-2.5">
        <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-fill">
          <AppIcon name="help" size={16} color={colors.muted} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
            {reading.bankName}
          </Text>
          <Text className="mt-0.5 text-label text-muted">Bank reading without account digits</Text>
        </View>
        <Text numberOfLines={1} className="text-body font-semibold text-ink">
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
  const colors = useThemeColors();
  if (detectedAccounts.length === 0 && unassignedReadings.length === 0) return null;

  const countLabel =
    detectedAccounts.length === 1
      ? "1 identity"
      : detectedAccounts.length > 1
        ? `${detectedAccounts.length} identities`
        : `${unassignedReadings.length} reading${unassignedReadings.length === 1 ? "" : "s"}`;

  return (
    <View className="mt-7">
      <View className="mb-3 flex-row items-center justify-between px-1">
        <Text className="text-subtitle font-bold tracking-tight text-ink">Detected accounts</Text>
        <Text className="text-caption text-muted">{countLabel}</Text>
      </View>

      <View className="mt-2.5 flex-row items-start gap-2 rounded-tile bg-accent-soft p-3">
        <AppIcon name="info" size={16} color={colors.accentDeep} />
        <Text className="flex-1 text-meta leading-4 text-accent-deep">
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
          <Text className="text-meta font-semibold text-ink-soft">
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
