import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { getLineAccountSummary } from "@/modules/line/services/line-account-service";
import { getLineDisconnectionStatus, type LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { UnauthenticatedError } from "@/shared/errors/application-error";

import { LineAccountClient } from "./line-account-client";

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
  try {
    const configuration = await requireLineDisconnectionReadiness();
    initial = await getLineAccountSummary();
    if (configuration) disconnection = await getLineDisconnectionStatus({ configuration });
    await scheduleCurrentLineAccountReconciliation();
  } catch (error: unknown) {
    initial = error instanceof UnauthenticatedError
      ? { status: "UNAUTHENTICATED", canUnlink: false, reachability: null, menuState: null, cleanupState: null }
      : { status: "UNAVAILABLE", canUnlink: false, reachability: null, menuState: null, cleanupState: null };
  }
  let publicOrigin = "";
  try {
    publicOrigin = getLineLoginEnv().DEMI_LINE_PUBLIC_ORIGIN;
  } catch {
    // The client displays a safe configuration state when the dedicated LINE configuration is missing.
  }
  return <LineAccountClient key={randomUUID()} initial={initial} liffId={getLineLiffId()} publicOrigin={publicOrigin} disconnection={disconnection} />;
}
