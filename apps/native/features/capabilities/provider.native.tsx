import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  AppState,
  PermissionsAndroid,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  DEFAULT_LOCAL_SETTINGS,
  getLocalSettings,
  type LocalSettings,
  updateLocalSettings,
} from "@/db/settings";
import { setBackgroundSyncRegistration } from "./background/task";
import { requestTransactionNotificationPermission } from "./notifications/notifications";
import {
  authenticateForAppAccess,
  canEnableBiometricLock,
  setScreenCaptureProtection,
} from "./native-capabilities";

export type CapabilityPreference = keyof LocalSettings;

interface CapabilityContextValue {
  settings: LocalSettings;
  error: string | null;
  setPreference(key: CapabilityPreference, enabled: boolean): Promise<boolean>;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function useCapabilities(): CapabilityContextValue {
  const value = useContext(CapabilityContext);
  if (!value) throw new Error("useCapabilities must be used within CapabilityProvider");
  return value;
}

export function CapabilityProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authenticating = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    if (!settingsRef.current.biometricLockEnabled) {
      setUnlocked(true);
      return;
    }

    authenticating.current = true;
    try {
      setUnlocked(await authenticateForAppAccess());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setUnlocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getLocalSettings()
      .then(async (stored) => {
        if (!active) return;
        setSettings(stored);
        settingsRef.current = stored;
        const results = await Promise.allSettled([
          setBackgroundSyncRegistration(stored.backgroundSyncEnabled),
          setScreenCaptureProtection(stored.screenCaptureProtectionEnabled),
        ]);
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected?.status === "rejected" && active) {
          setError(
            rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason),
          );
        }
        if (active) {
          setLoaded(true);
          await unlock();
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoaded(true);
        setUnlocked(true);
      });
    return () => {
      active = false;
    };
  }, [unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (settingsRef.current.biometricLockEnabled) setUnlocked(false);
        return;
      }
      if (loaded && settingsRef.current.biometricLockEnabled) void unlock();
    });
    return () => subscription.remove();
  }, [loaded, unlock]);

  const setPreference = useCallback(
    async (key: CapabilityPreference, enabled: boolean): Promise<boolean> => {
      setError(null);
      try {
        if (key === "backgroundSyncEnabled") {
          if (
            enabled &&
            !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))
          ) {
            setError("Grant SMS read access from the dashboard before enabling background sync.");
            return false;
          }
          await setBackgroundSyncRegistration(enabled);
        } else if (key === "transactionNotificationsEnabled" && enabled) {
          if (!(await requestTransactionNotificationPermission())) {
            setError("Notification permission was not granted.");
            return false;
          }
        } else if (key === "biometricLockEnabled" && enabled) {
          if (!(await canEnableBiometricLock())) {
            setError("Set up a strong fingerprint or face unlock on this device first.");
            return false;
          }
          if (!(await authenticateForAppAccess())) {
            setError("Biometric authentication was cancelled or failed.");
            return false;
          }
        } else if (key === "screenCaptureProtectionEnabled") {
          await setScreenCaptureProtection(enabled);
        }

        const next = await updateLocalSettings({ [key]: enabled });
        setSettings(next);
        settingsRef.current = next;
        if (key === "biometricLockEnabled") setUnlocked(true);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    },
    [],
  );

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", marginBottom: 10 }}>Zeeya is locked</Text>
        <Text style={{ textAlign: "center", opacity: 0.7, marginBottom: 20 }}>
          Authenticate to view your financial information.
        </Text>
        {error ? <Text style={{ color: "#b42318", marginBottom: 16 }}>{error}</Text> : null}
        <Pressable
          onPress={() => void unlock()}
          style={{
            backgroundColor: "#176b4d",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CapabilityContext.Provider value={{ settings, error, setPreference }}>
      {children}
    </CapabilityContext.Provider>
  );
}
