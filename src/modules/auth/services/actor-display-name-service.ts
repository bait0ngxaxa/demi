import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";


export async function getActorDisplayName(actor: ActorContext): Promise<string> {
  try {
    const person = await getPrisma().person.findUnique({
      where: { id: actor.personId },
      select: { givenName: true, familyName: true },
    });
    const displayName = [person?.givenName, person?.familyName]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" ");

    return displayName || "ผู้ใช้งาน DEMI";
  } catch (error: unknown) {
    throw toInfrastructureError("auth.getActorDisplayName", error, "Actor display name could not be loaded");
  }
}
