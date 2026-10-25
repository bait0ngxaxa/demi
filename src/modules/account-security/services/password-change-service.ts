import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { AuditEventInput } from "@/modules/audit/schemas/audit-schemas";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createAuthAttemptThrottle, type AuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import { notifyPasswordChangeLineBindings } from "./password-change-notification";
import { ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { authenticatedPasswordChangeSchema } from "../schemas/account-security-schemas";
import { CurrentPasswordRejectedError, updateAuthenticatedPassword } from "../adapters/supabase-account-security-provider";

export type AuthenticatedPasswordChangeProvider = (input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) => Promise<{ otherSessionsRevoked: boolean } | void>;

export type PasswordChangeAuditWriter = (input: AuditEventInput) => Promise<void>;

export type PasswordChangeDependencies = {
  provider?: AuthenticatedPasswordChangeProvider;
  audit?: PasswordChangeAuditWriter;
  database?: PrismaClient;
  attemptThrottle?: AuthAttemptThrottle;
  clientIpAddress?: string | null;
  now?: () => Date;
  sendLineMessage?: (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }>;
};

export class PasswordChangeAttemptThrottledError extends Error {
  constructor() {
    super("Password change attempts are temporarily blocked");
    this.name = "PasswordChangeAttemptThrottledError";
  }
}

export async function changeAuthenticatedUserPassword(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PasswordChangeDependencies = {},
): Promise<{ otherSessionsRevoked: boolean }> {
  if (!actor || !actor.userId.trim()) {
    throw new ForbiddenError();
  }

  const parsed = authenticatedPasswordChangeSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Password change data is invalid");
  }

  const updatePassword = dependencies.provider ?? updateAuthenticatedPassword;
  const database = dependencies.database ?? getPrisma();
  const user = await database.user.findUnique({
    where: { id: actor.userId },
    select: { person: { select: { identityKeyHash: true } } },
  });
  const identityHash = user?.person.identityKeyHash;
  if (!identityHash) throw new InfrastructureError("Account identity could not be confirmed");
  const attemptThrottle = dependencies.attemptThrottle ?? createAuthAttemptThrottle({ database });
  const now = dependencies.now?.() ?? new Date();
  const throttleInput = {
    scope: "PASSWORD_CHANGE" as const,
    identityHash,
    clientIp: dependencies.clientIpAddress ?? null,
    now,
  };
  if (await attemptThrottle.isBlocked(throttleInput)) throw new PasswordChangeAttemptThrottledError();

  let providerResult: { otherSessionsRevoked: boolean } | void;
  try {
    providerResult = await updatePassword({
      userId: actor.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordRejectedError) {
      await attemptThrottle.recordFailure(throttleInput);
      throw error;
    }
    throw new InfrastructureError("Account password could not be changed");
  }

  const audit = dependencies.audit ?? recordAuditEvent;

  try {
    await audit({
      actorUserId: actor.userId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      resourceType: "USER",
      resourceId: actor.userId,
    });
  } catch {
    // Provider success is confirmed; do not tell the User the old password still works.
    console.error("Password change succeeded but the security audit event could not be stored");
  }
  await notifyPasswordChangeLineBindings(database, actor.userId, now, dependencies.sendLineMessage);
  return { otherSessionsRevoked: providerResult?.otherSessionsRevoked ?? true };
}
