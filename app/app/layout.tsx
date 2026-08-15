import { redirect } from "next/navigation";
import { connection } from "next/server";

import { roleLabels } from "@/components/app-shell/actor-presentation";
import { projectApplicationNavigation } from "@/components/app-shell/application-navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

async function resolveProtectedActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function ProtectedApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveProtectedActor();
  const navigation = projectApplicationNavigation(actor);

  return (
    <AppShell
      navigation={navigation}
      roleLabels={actor.roles.map((role) => roleLabels[role])}
    >
      {children}
    </AppShell>
  );
}
