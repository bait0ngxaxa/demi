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
import { ProtectedApplicationShellSkeleton } from "@/components/app-shell/app-shell-skeleton";
import { getActorDisplayName } from "@/modules/auth/services/actor-display-name-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { isLineQuickActionLoginReturnTo } from "@/modules/auth/schemas/login-schema";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { LINE_QUICK_ACTION_RETURN_TO_HEADER } from "@/modules/line/domain/line-navigation-intents";
import { PUBLIC_CAREGIVER_INVITATION_PAGE_HEADER } from "@/lib/auth/supabase-proxy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, UnauthenticatedError } from "@/shared/errors/application-error";

export const viewport: Viewport = {
  viewportFit: "cover",
};

async function resolveProtectedActor(lineQuickActionReturnTo: string | null): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect(
        isLineQuickActionLoginReturnTo(lineQuickActionReturnTo)
          ? buildLoginReturnHref(lineQuickActionReturnTo)
          : "/login",
      );
    }

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
  const actor = await resolveProtectedActor(
    requestHeaders.get(LINE_QUICK_ACTION_RETURN_TO_HEADER),
  );
  const [hospitalWorkspaces, displayName] = await Promise.all([
    listNavigationHospitalWorkspaces(actor),
    getActorDisplayName(actor).catch((error: unknown) =>
      error instanceof InfrastructureError ? "ผู้ใช้งาน DEMI" : Promise.reject(error),
    ),
  ]);
  const navigation = projectApplicationNavigation(actor, hospitalWorkspaces);

  return (
    <AppShell
      displayName={displayName}
      navigation={navigation}
      roleLabels={actor.roles.map((role) => roleLabels[role])}
    >
      {children}
    </AppShell>
  );
}

export default function ProtectedApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <Suspense fallback={<ProtectedApplicationShellSkeleton />}>
      <ResolvedProtectedApplicationShell>{children}</ResolvedProtectedApplicationShell>
    </Suspense>
  );
}
