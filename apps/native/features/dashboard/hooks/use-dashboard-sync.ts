import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { deriveDashboard, type Dashboard } from "@/lib/dashboard";
import {
  deviceMessageCaptureRequiresReadPermission,
  isDeviceMessageCaptureSupported,
  syncDeviceMessages,
} from "@/lib/device-message-sync";
import { hasSmsReadPermission, requestSmsReadPermission } from "@/lib/sms";
import { subscribeToMessageSync } from "@/features/capabilities/message-sync-events";

export type Status =
  | "checking"
  | "needs-permission"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

export function useDashboardSync() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  // Empty-but-valid Dashboard (deriveDashboard([])) so every render before
  // the first successful load can read dashboard.* unconditionally, same
  // as before this screen read from the ledger.
  const [dashboard, setDashboard] = useState<Dashboard>(() => deriveDashboard([]));
  const [refreshing, setRefreshing] = useState(false);
  // Bumped on every load() call so a slow, stale in-flight read can't
  // overwrite a newer one's result if a refresh is triggered before the
  // previous one finished.
  const loadIdRef = useRef(0);

  // Platform capture lives behind syncDeviceMessages(): Android drains the
  // permitted SMS inbox, while iOS drains the App Group queue populated by
  // Zeeya's Apple Shortcuts action. Both paths return the same Dashboard.
  const load = useCallback(async () => {
    if (!isDeviceMessageCaptureSupported()) {
      setStatus("unsupported");
      return;
    }
    const id = ++loadIdRef.current;
    try {
      const nextDashboard = await syncDeviceMessages();
      if (id !== loadIdRef.current) return;
      setDashboard(nextDashboard);
      setStatus("ready");
    } catch (e) {
      if (id !== loadIdRef.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Android requires READ_SMS before the shared inbox load; RECEIVE_SMS is
  // only needed for opt-in arrival monitoring. iOS has no inbox permission
  // and can immediately drain its Shortcuts queue.
  const checkPermissionThenLoad = useCallback(() => {
    if (!deviceMessageCaptureRequiresReadPermission()) {
      void load();
      return;
    }
    hasSmsReadPermission()
      .then((granted) => {
        if (granted) void load();
        else setStatus("needs-permission");
      })
      .catch((e: unknown) => {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [load]);

  // useFocusEffect (not a plain useEffect) so this also resyncs whenever
  // this screen regains focus after navigating back — e.g. returning here
  // from the backfill screen (app/backfill.tsx) — not only on the very first
  // mount. It still runs on that first mount too (a screen is "focused"
  // the first time it renders), so nothing here needs to run twice.
  useFocusEffect(
    useCallback(() => {
      if (!isDeviceMessageCaptureSupported()) {
        setStatus("unsupported");
        return;
      }
      checkPermissionThenLoad();
    }, [checkPermissionThenLoad]),
  );

  // The app-root provider drains messages on every route, but this focused
  // screen must also consume the returned Dashboard after foreground resume;
  // otherwise the ledger updates while the visible totals remain stale.
  useEffect(() => {
    if (!isDeviceMessageCaptureSupported()) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkPermissionThenLoad();
    });
    return () => subscription.remove();
  }, [checkPermissionThenLoad]);

  // The app-root CapabilityProvider also syncs the inbox so messages are not
  // stranded while another route is visible. Reuse its already-derived
  // dashboard here when that sync completes instead of parsing the inbox a
  // second time just to refresh this screen.
  useEffect(() => {
    return subscribeToMessageSync((nextDashboard) => {
      loadIdRef.current += 1;
      setDashboard(nextDashboard);
      setError(null);
      setStatus("ready");
    });
  }, []);

  const connect = useCallback(async () => {
    setStatus("loading");
    try {
      const granted = await requestSmsReadPermission();
      if (!granted) {
        setStatus("needs-permission");
        return;
      }
      await load();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { status, error, dashboard, refreshing, connect, onRefresh };
}
