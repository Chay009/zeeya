import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { deriveDashboard, type Dashboard } from "@/lib/dashboard";
import {
  deviceMessageCaptureRequiresReadPermission,
  isDeviceMessageCaptureSupported,
  syncDeviceMessages,
} from "@/lib/device-message-sync";
import type { SyncProgress } from "@/db/sync";
import { hasSmsReadPermission, requestSmsReadPermission } from "@/lib/sms";
import type { ParsedSms } from "@/lib/sms";
import { subscribeToMessageSync } from "@/features/capabilities/message-sync-events";
import { findNewFinancialTransactions } from "@/features/capabilities/background/periodic-sync";

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
  // Scanned/inserted counts from the most recent in-progress sync (e.g. the
  // bounded initial 90-day scan) — null once nothing is actively syncing.
  // Deliberately not a percentage: the total to scan isn't known upfront.
  const [progress, setProgress] = useState<{ scanned: number; inserted: number } | null>(null);
  // Financial messages that appeared between two dashboard snapshots this
  // screen has actually shown — what the "you're back, here's what's new"
  // dialog renders. Accumulates across every dashboard update (a resumed
  // sync's own progress ticks included) until dismissed, de-duplicated by
  // message id.
  const [newSinceLastView, setNewSinceLastView] = useState<ParsedSms[]>([]);
  // Bumped on every load() call so a slow, stale in-flight read can't
  // overwrite a newer one's result if a refresh is triggered before the
  // previous one finished.
  const loadIdRef = useRef(0);
  const dashboardRef = useRef(dashboard);
  // True until the very first successful dashboard load this screen has
  // ever shown — suppresses the diff below for that one call, since
  // "before" would otherwise be the empty placeholder Dashboard and every
  // real message would spuriously look "new." Never flips back to true.
  const suppressDiffRef = useRef(true);

  // Every dashboard update (load()'s own result, its intermediate
  // progress ticks, and the app-root provider's own background sync via
  // subscribeToMessageSync below) routes through here, so "what's new
  // since this screen last showed something" has exactly one definition
  // regardless of which of those triggered the update.
  const applyDashboard = useCallback((next: Dashboard) => {
    const previous = dashboardRef.current;
    dashboardRef.current = next;
    setDashboard(next);
    if (!suppressDiffRef.current) {
      const added = findNewFinancialTransactions(previous, next);
      if (added.length > 0) {
        setNewSinceLastView((current) => {
          const existingIds = new Set(current.map((message) => message.id));
          const deduped = added.filter((message) => !existingIds.has(message.id));
          return deduped.length > 0 ? [...current, ...deduped] : current;
        });
      }
    }
  }, []);

  const dismissNewSinceLastView = useCallback(() => {
    setNewSinceLastView([]);
  }, []);

  // Platform capture lives behind syncDeviceMessages(): Android drains the
  // permitted SMS inbox, while iOS drains the App Group queue populated by
  // Zeeya's Apple Shortcuts action. Both paths return the same Dashboard.
  const load = useCallback(async () => {
    if (!isDeviceMessageCaptureSupported()) {
      setStatus("unsupported");
      return;
    }
    const id = ++loadIdRef.current;
    setProgress(null);
    try {
      const nextDashboard = await syncDeviceMessages({
        onProgress: (next: SyncProgress) => {
          // A slower, now-superseded load's progress ticks must not
          // overwrite a newer load's state — same staleness guard as the
          // final result below, just checked on every intermediate tick
          // too, not only once at the end.
          if (id !== loadIdRef.current) return;
          applyDashboard(next.dashboard);
          setProgress({ scanned: next.scanned, inserted: next.inserted });
        },
      });
      if (id !== loadIdRef.current) return;
      applyDashboard(nextDashboard);
      setStatus("ready");
      setProgress(null);
      // Only ever transitions true -> false, on this screen's first
      // successful load — see suppressDiffRef's own comment.
      suppressDiffRef.current = false;
    } catch (e) {
      if (id !== loadIdRef.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }, [applyDashboard]);

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
        // Distinct from "checking" the moment permission is confirmed —
        // otherwise the whole (often much slower) inbox sync/parse still
        // reports itself as "checking permission," which is simply wrong
        // once permission is already known to be granted.
        if (granted) {
          setStatus("loading");
          void load();
        } else {
          setStatus("needs-permission");
        }
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
      applyDashboard(nextDashboard);
      setError(null);
      setStatus("ready");
      // This provider-driven sync can be this screen's very first
      // dashboard update on some cold-start orderings — same one-time
      // transition as load()'s own success path.
      suppressDiffRef.current = false;
    });
  }, [applyDashboard]);

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

  return {
    status,
    error,
    dashboard,
    refreshing,
    progress,
    newSinceLastView,
    dismissNewSinceLastView,
    connect,
    onRefresh,
  };
}
