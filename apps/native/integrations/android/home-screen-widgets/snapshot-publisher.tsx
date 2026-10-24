import { useEffect } from "react";

import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";

import { toOverviewWidgetSnapshot } from "../../shared/widgets/overview-snapshot";
import OverviewWidget from "./overview-widget";

export function WidgetSnapshotPublisher() {
  const currency = usePrimaryCurrency();
  const { model } = useHomeReadModel(currency);

  useEffect(() => {
    if (model) OverviewWidget.updateSnapshot(toOverviewWidgetSnapshot(model));
  }, [model]);

  return null;
}
