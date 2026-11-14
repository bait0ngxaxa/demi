import type { PendingActionsResult } from "@/modules/pending-actions/services/pending-action-service";
import type { PendingAction } from "@/components/ui/action-required-dot";
import type { ApplicationNavigationGroup, ApplicationNavigationItem } from "./navigation-types";

export function navigationPendingAction(item: Pick<ApplicationNavigationItem, "pendingAction" | "badgeCount">): PendingAction | undefined {
  return item.pendingAction ?? (item.badgeCount === undefined ? undefined : { count: item.badgeCount, label: "งานรอดำเนินการ" });
}

/**
 * Decorates only destinations already admitted by the existing navigation policies. UNAVAILABLE adds no dots; the
 * shell states that indicators could not be checked instead of implying a verified empty queue.
 */
export function withNavigationPendingActions(
  navigation: readonly ApplicationNavigationGroup[],
  pendingActions: PendingActionsResult,
): readonly ApplicationNavigationGroup[] {
  if (pendingActions.status !== "READY") return navigation;
  const byHref = new Map(pendingActions.indicators.map((indicator) => [indicator.navigationHref, indicator]));
  return navigation.map((group) => ({ ...group, items: group.items.map((item) => {
    const indicator = byHref.get(item.href);
    return indicator && indicator.count > 0
      ? { ...item, pendingAction: {
        count: indicator.count, label: indicator.label, href: indicator.href,
        ...(indicator.hospitalQueue
          ? { hospitalCount: indicator.hospitalQueue.hospitals.filter(({ count }) => count > 0).length }
          : {}),
      } }
      : item;
  }) }));
}
