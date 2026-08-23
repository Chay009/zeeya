import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid } from "react-native";

import { syncInbox } from "@/db/sync";
import { deriveDashboard, type Dashboard } from "@/lib/dashboard";
import {
  isSmsReadSupported,
  readSmsInbox,
  requestSmsReadPermission,
} from "@/lib/sms";

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

  // The checkpoint/read/ingest/reload sequence itself lives in
  // db/sync.ts's syncInbox() — unit-tested there directly (this file, a
  // React Native hook, can't be imported under Vitest at all — see
  // lib/sms.ts's own comment on why). readSmsInbox is passed in as the
  // real inbox reader.
  const load = useCallback(async () => {
    if (!isSmsReadSupported()) {
      setStatus("unsupported");
      return;
    }
    const id = ++loadIdRef.current;
    try {
      const nextDashboard = await syncInbox(readSmsInbox);
      if (id !== loadIdRef.current) return;
      setDashboard(nextDashboard);
      setStatus("ready");
    } catch (e) {
      if (id !== loadIdRef.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Shared by mount and app-foreground-resume below so both go through the
  // same permission check before ever calling load() — load() itself
  // assumes permission is already granted, so skipping this check on
  // foreground resume (calling load() unconditionally) would turn a
  // legitimate "needs-permission" state into a spurious "error" the first
  // time the app resumes without SMS access granted.
  const checkPermissionThenLoad = useCallback(() => {
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
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
      if (!isSmsReadSupported()) {
        setStatus("unsupported");
        return;
      }
      checkPermissionThenLoad();
    }, [checkPermissionThenLoad]),
  );

  // Resyncs whenever the app returns to the foreground (e.g. backgrounded
  // during a bank OTP/SMS arrival, then reopened) — not just on initial
  // mount and explicit pull-to-refresh, so newly-arrived SMS actually get
  // picked up on the ordinary "switch back to the app" path, not only when
  // the app was freshly launched or the user manually refreshed.
  useEffect(() => {
    if (!isSmsReadSupported()) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkPermissionThenLoad();
    });
    return () => subscription.remove();
  }, [checkPermissionThenLoad]);

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
