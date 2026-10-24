import { useEffect } from "react";

import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";

import { toOverviewWidgetSnapshot } from "../../shared/widgets/overview-snapshot";
import OverviewWidget from "./overview-widget";
import LockScreenWidget from "../lock-screen-widgets/overview-widget";

/** Keeps WidgetKit's small count-only snapshot in step with the live SQL read model. */
export function WidgetSnapshotPublisher() {
  const currency = usePrimaryCurrency();
  const { model } = useHomeReadModel(currency);

  useEffect(() => {
    if (model) {
      const snapshot = toOverviewWidgetSnapshot(model);
      OverviewWidget.updateSnapshot(snapshot);
      LockScreenWidget.updateSnapshot(snapshot);
    }
  }, [model]);

  return null;
}
