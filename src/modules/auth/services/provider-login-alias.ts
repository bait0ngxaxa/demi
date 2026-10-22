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

export function createProviderResetLoginAlias(userId: string, resetId: string): string {
  const parsedUserId = userIdSchema.safeParse(userId);
  const parsedResetId = userIdSchema.safeParse(resetId);

  if (!parsedUserId.success || !parsedResetId.success) {
    throw new InfrastructureError("Provider login identity could not be resolved");
  }

  return `${parsedUserId.data}.${parsedResetId.data}@${PROVIDER_LOGIN_DOMAIN}`;
}
