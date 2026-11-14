import { Suspense } from "react";
import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { connection } from "next/server";

import { roleLabels } from "@/components/app-shell/actor-presentation";
import {
  listNavigationHospitalWorkspaces,
  projectApplicationNavigation,
} from "@/components/app-shell/application-navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { LineAccountNavigationProvider } from "@/components/line/line-account-navigation";
import { ProtectedApplicationShellSkeleton } from "@/components/app-shell/app-shell-skeleton";
import { getActorDisplayName } from "@/modules/auth/services/actor-display-name-service";
import { consumePasswordResetNotice } from "@/modules/account-security/services/password-reset-notice-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPendingActions, type PendingActionsResult } from "@/modules/pending-actions/services/pending-action-service";
import { withNavigationPendingActions } from "@/components/app-shell/navigation-pending-actions";
import { isLineQuickActionLoginReturnTo } from "@/modules/auth/schemas/login-schema";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { LINE_QUICK_ACTION_RETURN_TO_HEADER } from "@/modules/line/domain/line-navigation-intents";
import { getPublicLineAccountEntryUrl } from "@/modules/line/services/line-deep-link-builder";
import { getLineWorkspaceLiffId } from "@/lib/env/server";
import { PUBLIC_CAREGIVER_INVITATION_PAGE_HEADER } from "@/lib/auth/supabase-proxy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { shouldShowLegalReacceptanceBanner } from "@/modules/legal/transport/legal-settings-context";
import { ForbiddenError, InfrastructureError, UnauthenticatedError } from "@/shared/errors/application-error";

import { WorkspaceLiffHistory } from "../workspace-liff-history";

export const viewport: Viewport = {
  viewportFit: "cover",
};

function redirectDeniedAccess(error: unknown, lineQuickActionReturnTo: string | null): void {
  if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
    redirect(
      isLineQuickActionLoginReturnTo(lineQuickActionReturnTo)
        ? buildLoginReturnHref(lineQuickActionReturnTo)
        : "/login",
    );
  }
}

async function resolveProtectedActor(lineQuickActionReturnTo: string | null): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    redirectDeniedAccess(error, lineQuickActionReturnTo);
    throw error;
  }
}

/**
 * Indicator infrastructure failures arrive as UNAVAILABLE and never block the shell. An actor revoked between the
 * session check and the indicator re-read is denied through the same protected-access handling as the shell.
 */
async function resolvePendingActions(userId: string, lineQuickActionReturnTo: string | null): Promise<PendingActionsResult> {
  try {
    return await getPendingActions(userId);
  } catch (error: unknown) {
    redirectDeniedAccess(error, lineQuickActionReturnTo);
    throw error;
  }
}

async function ResolvedProtectedApplicationShell({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  await connection();
  const requestHeaders = await headers();
  if (requestHeaders.get(PUBLIC_CAREGIVER_INVITATION_PAGE_HEADER) === "1") {
    return <>{children}</>;
  }
  const lineQuickActionReturnTo = requestHeaders.get(LINE_QUICK_ACTION_RETURN_TO_HEADER);
  const actor = await resolveProtectedActor(lineQuickActionReturnTo);
  const [hospitalWorkspaces, pendingActions, displayName, passwordResetNoticeAt, legalReacceptanceNeeded] = await Promise.all([
    listNavigationHospitalWorkspaces(actor),
    resolvePendingActions(actor.userId, lineQuickActionReturnTo),
    getActorDisplayName(actor).catch((error: unknown) =>
      error instanceof InfrastructureError ? "ผู้ใช้งาน DEMI" : Promise.reject(error),
    ),
    consumePasswordResetNotice(actor.userId).catch(() => {
      console.error("Pending password reset notice could not be consumed");
      return null;
    }),
    shouldShowLegalReacceptanceBanner(actor),
  ]);
  const navigation = withNavigationPendingActions(projectApplicationNavigation(actor, hospitalWorkspaces), pendingActions);

  return (
    // Canonical Account LIFF URL for Workspace LIFF -> Account LIFF transitions; null keeps the ordinary route.
    <LineAccountNavigationProvider accountLiffUrl={getPublicLineAccountEntryUrl()}>
      <AppShell
        displayName={displayName}
        legalReacceptanceNeeded={legalReacceptanceNeeded}
        navigation={navigation}
        passwordResetNoticeAt={passwordResetNoticeAt}
        pendingActionsCheckedAt={pendingActions.checkedAt}
        pendingActionsStatus={pendingActions.status}
        roleLabels={actor.roles.map((role) => roleLabels[role])}
      >
        {children}
      </AppShell>
    </LineAccountNavigationProvider>
  );
}

export default function ProtectedApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <>
      <Suspense fallback={<ProtectedApplicationShellSkeleton />}>
        {/* Only history observation suspends here; SDK initialization already finished in the public shell. */}
        <WorkspaceLiffHistory liffId={getLineWorkspaceLiffId()} />
        <ResolvedProtectedApplicationShell>{children}</ResolvedProtectedApplicationShell>
      </Suspense>
    </>
  );
}
