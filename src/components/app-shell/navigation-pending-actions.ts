import type { PendingActionIndicator } from "@/modules/pending-actions/services/pending-action-service";
import type { PendingAction } from "@/components/ui/action-required-dot";
import type { ApplicationNavigationGroup, ApplicationNavigationItem } from "./navigation-types";

export function navigationPendingAction(item: Pick<ApplicationNavigationItem, "pendingAction" | "badgeCount">): PendingAction | undefined {
  return item.pendingAction ?? (item.badgeCount === undefined ? undefined : { count: item.badgeCount, label: "งานรอดำเนินการ" });
}

/** Decorates only destinations already admitted by the existing navigation policies. */
export function withNavigationPendingActions(
  navigation: readonly ApplicationNavigationGroup[],
  indicators: readonly PendingActionIndicator[],
): readonly ApplicationNavigationGroup[] {
  const byHref = new Map(indicators.map((indicator) => [indicator.navigationHref, indicator]));
  return navigation.map((group) => ({ ...group, items: group.items.map((item) => {
    const indicator = byHref.get(item.href);
    return indicator && indicator.count > 0
      ? { ...item, pendingAction: { count: indicator.count, label: indicator.label, href: indicator.href } }
      : item;
  }) }));
}
