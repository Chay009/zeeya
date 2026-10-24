import { useEffect } from "react";
import * as QuickActions from "expo-quick-actions";
import { useQuickAction } from "expo-quick-actions/hooks";
import { useRouter } from "expo-router";

import { HOME_QUICK_ACTIONS } from "./items";

export function QuickActionRegistration() {
  // This component lives in the tabs sub-layout, after the root navigator has
  // mounted. The package explicitly warns against routing from app/_layout.
  const router = useRouter();
  const action = useQuickAction();
  useEffect(() => {
    const destination = HOME_QUICK_ACTIONS.find((item) => item.id === action?.id);
    if (!destination) return;
    // Preserve the helper's deferred cold-start navigation after the navigator commits.
    const timeout = setTimeout(() => {
      router.navigate(destination.params.href, { withAnchor: true });
    }, 0);
    return () => clearTimeout(timeout);
  }, [action, router]);

  useEffect(() => {
    let mounted = true;

    async function register() {
      if (!mounted) return;
      // Android's isSupported() currently tests pinned-shortcut support, which
      // is not the same as dynamic app-icon shortcuts used here.
      const maxCount = QuickActions.maxCount ?? HOME_QUICK_ACTIONS.length;
      await QuickActions.setItems(HOME_QUICK_ACTIONS.slice(0, maxCount));
    }

    // A missing/unsupported native module must not prevent app navigation.
    void register().catch((error: unknown) => {
      console.warn("Could not register home-screen quick actions", error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
