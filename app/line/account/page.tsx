import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { getLineAccountSummary } from "@/modules/line/services/line-account-service";
import { getLineDisconnectionStatus, hasLineLifecycleHistoryForCurrentOwner, type LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { UnauthenticatedError } from "@/shared/errors/application-error";

import { LineAccountClient, type LineAccountLifecycleReadiness } from "./line-account-client";

export const dynamic = "force-dynamic";

export default async function LineAccountPage(): Promise<React.JSX.Element> {
  await connection();
  let disconnection: LineDisconnectionStatus | undefined;
  let initial: {
    status: "UNAUTHENTICATED" | "UNLINKED" | "LINKED" | "INELIGIBLE" | "UNAVAILABLE";
    canUnlink: boolean;
    reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
    menuState: "UNKNOWN" | "APPLIED" | "MISMATCH" | "UNAVAILABLE" | null;
    cleanupState: "PENDING" | "CONFIRMED_CLEAN" | "MISMATCH" | "UNAVAILABLE" | "UNKNOWN" | null;
  };
  let lifecycleReadiness: LineAccountLifecycleReadiness = { state: "NOT_CHECKED" };
  try {
    initial = await getLineAccountSummary();
  } catch (error: unknown) {
    initial = error instanceof UnauthenticatedError
      ? { status: "UNAUTHENTICATED", canUnlink: false, reachability: null, menuState: null, cleanupState: null }
      : { status: "UNAVAILABLE", canUnlink: false, reachability: null, menuState: null, cleanupState: null };
  }

  const accountManagementAvailable = initial.status !== "UNAUTHENTICATED" && initial.status !== "UNAVAILABLE" &&
    (initial.status !== "INELIGIBLE" || initial.canUnlink);
  if (accountManagementAvailable) {
    let configurationReady = false;
    let staged = false;
    try {
      const configuration = await requireLineDisconnectionReadiness();
      if (configuration) {
        disconnection = await getLineDisconnectionStatus({ configuration });
        lifecycleReadiness = { state: "READY" };
        configurationReady = true;
      } else {
        staged = true;
      }
    } catch {
      // Keep the independent Account summary usable; Link/Recovery remain fenced.
    }

    if (!configurationReady) {
      try {
        const hasHistory = await hasLineLifecycleHistoryForCurrentOwner();
        lifecycleReadiness = staged && !hasHistory
          ? { state: "STAGED" }
          : { state: "DEGRADED", history: hasHistory ? "PRESENT" : "NONE" };
      } catch {
        lifecycleReadiness = { state: "DEGRADED", history: "UNKNOWN" };
      }
    }

    try {
      await scheduleCurrentLineAccountReconciliation();
    } catch {
      // Rich Menu reconciliation is non-authoritative and must not hide Account management.
    }
  }

  let publicOrigin = "";
  try {
    publicOrigin = getLineLoginEnv().DEMI_LINE_PUBLIC_ORIGIN;
  } catch {
    // The client displays a safe configuration state when the dedicated LINE configuration is missing.
  }
  return <LineAccountClient key={randomUUID()} initial={initial} liffId={getLineLiffId()} publicOrigin={publicOrigin} disconnection={disconnection} lifecycleReadiness={lifecycleReadiness} />;
}
