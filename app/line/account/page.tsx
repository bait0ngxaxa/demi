import { connection } from "next/server";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { getLineAccountSummary } from "@/modules/line/services/line-account-service";
import { reconcileCurrentLineAccount } from "@/modules/line/services/line-entry-reconciliation";
import { UnauthenticatedError } from "@/shared/errors/application-error";

import { LineAccountClient } from "./line-account-client";

export const dynamic = "force-dynamic";

export default async function LineAccountPage(): Promise<React.JSX.Element> {
  await connection();
  let initial: {
    status: "UNAUTHENTICATED" | "UNLINKED" | "LINKED" | "INELIGIBLE" | "UNAVAILABLE";
    canUnlink: boolean;
    reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
    menuState: "UNKNOWN" | "APPLIED" | "MISMATCH" | "UNAVAILABLE" | null;
    cleanupState: "PENDING" | "CONFIRMED_CLEAN" | "MISMATCH" | "UNAVAILABLE" | "UNKNOWN" | null;
  };
  try {
    initial = await getLineAccountSummary();
    await reconcileCurrentLineAccount().catch(() => undefined);
    initial = await getLineAccountSummary();
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
  return <LineAccountClient initial={initial} liffId={getLineLiffId()} publicOrigin={publicOrigin} />;
}
