import "server-only";

import { z } from "zod";

import { InfrastructureError } from "@/shared/errors/application-error";

const userIdSchema = z.uuid();
const PROVIDER_LOGIN_DOMAIN = "auth.demi.internal";

export function createProviderLoginAlias(userId: string): string {
  const parsed = userIdSchema.safeParse(userId);

  if (!parsed.success) {
    throw new InfrastructureError("Provider login identity could not be resolved");
  }

  return `${parsed.data}@${PROVIDER_LOGIN_DOMAIN}`;
}
