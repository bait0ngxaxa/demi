import "server-only";

import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { ApplicationWorkspaceContext } from "./navigation-types";

export function getAvailableApplicationWorkspaces(
  actor: ActorContext,
): ApplicationWorkspaceContext[] {
  const workspaces: ApplicationWorkspaceContext[] = [];

  if (actor.roles.includes(Role.PATIENT)) {
    workspaces.push("personal");
  }

  if (
    actor.roles.some(
      (role) => role === Role.ADMIN || role === Role.HOSPITAL || role === Role.OSM,
    )
  ) {
    workspaces.push("work");
  }

  return workspaces;
}
