import { Image, Text, View } from "react-native";

import type { HomeAccount } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

type BankIconPosition = {
  right?: number;
  left?: number;
  top?: number;
  bottom?: number;
  size: number;
  opacity: number;
  rotate: `${number}deg`;
};

const BANK_ICON_POSITIONS: readonly BankIconPosition[] = [
  { right: -24, top: -24, size: 132, opacity: 0.1, rotate: "-12deg" },
  { right: 58, top: 82, size: 72, opacity: 0.08, rotate: "9deg" },
  { right: -18, bottom: -54, size: 142, opacity: 0.08, rotate: "14deg" },
  { left: 120, bottom: -32, size: 84, opacity: 0.06, rotate: "-8deg" },
] as const;

export function BankIconPattern({ uri }: { uri?: string }) {
  if (!uri) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {BANK_ICON_POSITIONS.map((position, index) => (
        <Image
          key={index}
          source={{ uri }}
          resizeMode="contain"
          style={{
            position: "absolute",
            ...(position.right !== undefined ? { right: position.right } : {}),
            ...(position.left !== undefined ? { left: position.left } : {}),
            ...(position.top !== undefined ? { top: position.top } : {}),
            ...(position.bottom !== undefined ? { bottom: position.bottom } : {}),
            width: position.size,
            height: position.size,
            opacity: position.opacity,
            transform: [{ rotate: position.rotate }],
          }}
        />
      ))}
    </View>
  );
}

export function AccountCard({ account }: { account: HomeAccount }) {
  return (
    <View
      style={{
        borderRadius: 27,
        backgroundColor: hp.mint,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BankIconPattern uri={account.bankIcon} />
      <View
        style={{
          position: "absolute",
          right: -32,
          top: -80,
          width: 208,
          height: 208,
          borderRadius: 104,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.25)",
        }}
      />
      <View
        style={{
          position: "absolute",
          right: -38,
          bottom: -112,
          width: 192,
          height: 192,
          borderRadius: 96,
          borderWidth: 1,
          borderColor: "rgba(24,84,61,0.18)",
        }}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <BrandLogo
            letter={account.bankName.charAt(0).toUpperCase() || "?"}
            tile="white"
            ink={hp.emerald}
            img={account.bankIcon}
            size={24}
            radius={12}
            iconRatio={0.7}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: "800",
              color: "white",
            }}
          >
            {account.bankName.toUpperCase()}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.15)",
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.9)" }}>
            {account.status}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 28,
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.8,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            AVAILABLE BALANCE
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 4,
              fontSize: 27,
              fontWeight: "800",
              letterSpacing: -1.75,
              color: "white",
            }}
          >
            {account.balance}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)" }}>
            •••• {account.last4}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 10,
              fontWeight: "700",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            Net across accounts
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>
            {account.netAcross}
          </Text>
        </View>
      </View>

      {(account.balanceMeta || account.unassignedNote) && (
        <View
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.24)",
          }}
        >
          {account.balanceMeta && (
            <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.78)" }}>
              {account.balanceMeta}
            </Text>
          )}

          {account.capturedChange && (
            <View style={{ marginTop: 10, flexDirection: "row", gap: 12 }}>
              {account.reportedBalance && account.reportedMeta && (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.62)" }}>
                    BANK REPORTED
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: 14,
                      fontWeight: "800",
                      color: "white",
                    }}
                  >
                    {account.reportedBalance}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 2, fontSize: 9, color: "rgba(255,255,255,0.62)" }}
                  >
                    {account.reportedMeta}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.62)" }}>
                  CAPTURED CHANGE
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 14,
                    fontWeight: "800",
                    color: "white",
                  }}
                >
                  {account.capturedChange}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 9, color: "rgba(255,255,255,0.62)" }}>
                  {account.capturedTransactionCount} captured transaction
                  {account.capturedTransactionCount === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          )}

          {account.capturedIncome && account.capturedExpense && (
            <View style={{ marginTop: 8, flexDirection: "row", gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>
                Added {account.capturedIncome}
              </Text>
              <Text style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>
                Spent {account.capturedExpense}
              </Text>
            </View>
          )}

          {account.reconciliation && (
            <Text style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>
              {account.reconciliation}
            </Text>
          )}
          {account.unassignedNote && (
            <Text style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>
              {account.unassignedNote}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
