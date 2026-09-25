import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { Button, Spinner } from "heroui-native";
import { AppState, Platform, View } from "react-native";

import { AppText as Text } from "@/components/app-text";

import {
  DEFAULT_LOCAL_SETTINGS,
  getLocalSettings,
  type LocalSettings,
  updateLocalSettings,
} from "@/db/settings";
import type { Dashboard } from "@/lib/dashboard";
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
import AndroidMessageQueueModule from "@/modules/zeeya-message-queue/src/ZeeyaMessageQueueModule.android";
import { setBackgroundSyncRegistration } from "./background/task";
import { publishMessageSync } from "./message-sync-events";
import { requestTransactionNotificationPermission } from "./notifications/notifications";
import {
  authenticateForAppAccess,
  canEnableBiometricLock,
  setScreenCaptureProtection,
} from "./native-capabilities";
import { subscribeToRealtimeSms } from "./realtime-sms";
import { shouldNotifyBackgroundSms, shouldSubscribeToRealtimeSms } from "./realtime-sms-policy";

async function mirrorNativeBackgroundNotificationPreference(
  settings: Pick<LocalSettings, "backgroundSyncEnabled" | "transactionNotificationsEnabled">,
): Promise<void> {
  if (Platform.OS !== "android" || !AndroidMessageQueueModule) return;
  await AndroidMessageQueueModule.setBackgroundNotificationEnabled(
    shouldNotifyBackgroundSms(settings),
  );
}

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
  const [appState, setAppState] = useState(AppState.currentState);
  const authenticating = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncCapturedMessages = useCallback(
    async (
      options: { failOnMissingReadPermission?: boolean } = {},
    ): Promise<Dashboard | undefined> => {
      if (!isDeviceMessageCaptureSupported()) return undefined;
      if (deviceMessageCaptureRequiresReadPermission() && !(await hasSmsReadPermission())) {
        if (options.failOnMissingReadPermission) {
          throw new Error("READ_SMS permission is required to process newly received SMS.");
        }
        return undefined;
      }
      const dashboard = await syncDeviceMessages();
      publishMessageSync(dashboard);
      return dashboard;
    },
    [],
  );

  // While the app is active, publish the synchronized dashboard so Home's
  // in-app caught-up dialog updates immediately. The native receiver owns
  // the privacy-safe OS notice while backgrounded; the JS observer is
  // unmounted outside the foreground so it cannot consume that signal.
  const notifyRealtimeSync = useCallback(async () => {
    await syncCapturedMessages({ failOnMissingReadPermission: true });
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
          mirrorNativeBackgroundNotificationPreference(stored),
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
    if (!loaded || !shouldSubscribeToRealtimeSms(Platform.OS, appState === "active", true)) return;

    let cancelled = false;
    let stop: () => void = () => undefined;
    void hasSmsCapturePermissions()
      .then((granted) => {
        if (cancelled || !granted) {
          return;
        }
        stop = subscribeToRealtimeSms(notifyRealtimeSync, (cause) => {
          console.warn("Zeeya could not process a newly received SMS", cause);
        });
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
  }, [appState, loaded, notifyRealtimeSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppState(state);
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
        if (key === "backgroundSyncEnabled" || key === "transactionNotificationsEnabled") {
          await mirrorNativeBackgroundNotificationPreference(next);
        }
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
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Text className="mb-3 text-screen font-extrabold text-foreground">Zeeya is locked</Text>
        <Text className="mb-5 text-center text-body text-muted">
          Authenticate to view your financial information.
        </Text>
        {error ? <Text className="mb-4 text-caption text-danger">{error}</Text> : null}
        <Button onPress={() => void unlock()}>Unlock</Button>
      </View>
    );
  }

  return (
    <CapabilityContext.Provider value={{ settings, error, setPreference }}>
      {children}
    </CapabilityContext.Provider>
  );
}
