import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from "react-native";

import {
  DEFAULT_LOCAL_SETTINGS,
  getLocalSettings,
  type LocalSettings,
  updateLocalSettings,
} from "@/db/settings";
import {
  deviceMessageCaptureRequiresReadPermission,
  isDeviceMessageCaptureSupported,
  syncDeviceMessages,
} from "@/lib/device-message-sync";
import {
  hasSmsCapturePermissions,
  hasSmsReadPermission,
  requestSmsCapturePermissions,
} from "@/lib/sms";
import { setBackgroundSyncRegistration } from "./background/task";
import { publishMessageSync } from "./message-sync-events";
import { requestTransactionNotificationPermission } from "./notifications/notifications";
import {
  authenticateForAppAccess,
  canEnableBiometricLock,
  setScreenCaptureProtection,
} from "./native-capabilities";
import { subscribeToRealtimeSms } from "./realtime-sms";
import { shouldSubscribeToRealtimeSms } from "./realtime-sms-policy";

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

  const syncCapturedMessages = useCallback(
    async (options: { failOnMissingReadPermission?: boolean } = {}) => {
      if (!isDeviceMessageCaptureSupported()) return;
      if (deviceMessageCaptureRequiresReadPermission() && !(await hasSmsReadPermission())) {
        if (options.failOnMissingReadPermission) {
          throw new Error("READ_SMS permission is required to process newly received SMS.");
        }
        return;
      }
      const dashboard = await syncDeviceMessages();
      publishMessageSync(dashboard);
    },
    [],
  );

  const syncCapturedMessagesSafely = useCallback(() => {
    void syncCapturedMessages().catch((cause) => {
      // Capture is opportunistic at the app root. The dashboard still owns
      // user-visible retry/error state, while this path ensures queued iOS
      // Shortcut messages are not stranded on non-dashboard routes.
      console.warn("Zeeya could not synchronize captured messages", cause);
    });
  }, [syncCapturedMessages]);

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
    if (loaded) syncCapturedMessagesSafely();
  }, [loaded, syncCapturedMessagesSafely]);

  useEffect(() => {
    if (!loaded || !settings.backgroundSyncEnabled || Platform.OS !== "android") return;

    let cancelled = false;
    let stop: () => void = () => undefined;
    void hasSmsCapturePermissions()
      .then((granted) => {
        if (
          cancelled ||
          !shouldSubscribeToRealtimeSms("android", settings.backgroundSyncEnabled, granted)
        ) {
          return;
        }
        stop = subscribeToRealtimeSms(
          () => syncCapturedMessages({ failOnMissingReadPermission: true }),
          (cause) => {
            console.warn("Zeeya could not process a newly received SMS", cause);
          },
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          console.warn("Zeeya could not check SMS receive permission", cause);
        }
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [loaded, settings.backgroundSyncEnabled, syncCapturedMessages]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (settingsRef.current.biometricLockEnabled) setUnlocked(false);
        return;
      }
      if (loaded) syncCapturedMessagesSafely();
      if (loaded && settingsRef.current.biometricLockEnabled) void unlock();
    });
    return () => subscription.remove();
  }, [loaded, syncCapturedMessagesSafely, unlock]);

  const setPreference = useCallback(
    async (key: CapabilityPreference, enabled: boolean): Promise<boolean> => {
      setError(null);
      try {
        if (key === "backgroundSyncEnabled") {
          if (Platform.OS === "android" && enabled) {
            const granted = (await hasSmsCapturePermissions())
              ? true
              : await requestSmsCapturePermissions();
            if (!granted) {
              setError("Grant SMS read and receive access to enable background sync.");
              return false;
            }
          }
          await setBackgroundSyncRegistration(enabled);
        } else if (key === "transactionNotificationsEnabled" && enabled) {
          if (!(await requestTransactionNotificationPermission())) {
            setError("Notification permission was not granted.");
            return false;
          }
        } else if (key === "biometricLockEnabled" && enabled) {
          if (!(await canEnableBiometricLock())) {
            setError("Set up a device PIN, passcode, or biometric unlock on this device first.");
            return false;
          }
          if (!(await authenticateForAppAccess())) {
            setError("Device authentication was cancelled or failed.");
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
