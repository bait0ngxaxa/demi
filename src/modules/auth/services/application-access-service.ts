import "server-only";

import {
  ForbiddenError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";
import {
  resolveCurrentActorAccess,
  type CurrentActorAccess,
} from "./actor-context-service";

export type CurrentActorAccessResolver = () => Promise<CurrentActorAccess>;

export async function getProtectedApplicationActor(
  resolveAccess: CurrentActorAccessResolver = resolveCurrentActorAccess,
): Promise<ActorContext> {
  const access = await resolveAccess();

  if (access.status === "UNAUTHENTICATED") {
    throw new UnauthenticatedError();
  }

  if (access.status === "APPLICATION_ACCESS_DENIED") {
    throw new ForbiddenError("Application access is not available for this account");
  }

  return access.actor;
}
