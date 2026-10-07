import "server-only";

import { after } from "next/server";

import { resolveCurrentLineReconciliationTarget } from "../services/line-entry-reconciliation";
import { reconcileLineBindingIds } from "../services/line-menu-reconciler";

export function scheduleLineBindingReconciliation(bindingIds: readonly string[]): void {
  const uniqueBindingIds = [...new Set(bindingIds)];
  if (uniqueBindingIds.length === 0) return;

  try {
    after(async () => {
      try {
        await reconcileLineBindingIds(uniqueBindingIds);
      } catch {
        // Durable state remains available to lazy and operator repair.
      }
    });
  } catch {
    // A scheduling failure must not change the already-committed local outcome.
  }
}

export async function scheduleCurrentLineAccountReconciliation(): Promise<void> {
  let bindingId: string | null;
  try {
    bindingId = await resolveCurrentLineReconciliationTarget();
  } catch {
    return;
  }
  if (bindingId) scheduleLineBindingReconciliation([bindingId]);
}
