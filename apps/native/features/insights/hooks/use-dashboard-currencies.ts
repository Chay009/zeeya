import { useCallback, useEffect, useRef, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";

import {
  createDashboardCurrenciesController,
  type DashboardCurrenciesController,
  type DashboardCurrenciesState,
} from "./dashboard-currencies-controller";

export type {
  DashboardCurrenciesState,
  DashboardCurrenciesStatus,
} from "./dashboard-currencies-controller";

export interface UseDashboardCurrenciesResult extends DashboardCurrenciesState {
  reload: () => void;
}

export function useDashboardCurrencies(): UseDashboardCurrenciesResult {
  const { syncRevision } = useDashboardSync();
  const controllerRef = useRef<DashboardCurrenciesController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDashboardCurrenciesController({
      load: () => financeDataSource.dashboard.listCurrencies(),
    });
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<DashboardCurrenciesState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => controller.sync(syncRevision), [controller, syncRevision]);

  const reload = useCallback(() => controller.reload(), [controller]);
  return { ...state, reload };
}
