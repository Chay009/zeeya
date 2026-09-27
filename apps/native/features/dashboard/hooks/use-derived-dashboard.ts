// The full in-memory Dashboard, derived from the whole ledger — for the dev
// screens only (the raw dashboard and dev transaction route). App screens
// read the SQLite projection instead, and no sync derives this just to hand
// it around: it is computed here, on demand, only while a dev screen is
// mounted, and re-derived live when local data changes (lib/live-queries.ts).
import { loadDashboard } from "@/db/ingestion";
import { withIngestionLock } from "@/db/single-flight";
import { deriveDashboard, type Dashboard } from "@/lib/dashboard";
import { useLocalQuery } from "@/lib/use-local-query";

const EMPTY_DASHBOARD = deriveDashboard([]);

export function useDerivedDashboard(): Dashboard {
  const { data } = useLocalQuery({
    queryKey: ["local", "dev-derived-dashboard"],
    // loadDashboard reparses stale ledger rows (a write), so it queues
    // behind any running sync like every other ledger writer.
    queryFn: () => withIngestionLock(() => loadDashboard()),
  });
  return data ?? EMPTY_DASHBOARD;
}
