"use server";

import { resolveCurrentActorContext } from "../services/actor-context-service";
import type { ActorContext } from "../types/actor-context";

export async function getActorContextAction(): Promise<ActorContext | null> {
  return resolveCurrentActorContext();
}
