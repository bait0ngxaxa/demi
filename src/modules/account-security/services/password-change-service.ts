import "server-only";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { AuditEventInput } from "@/modules/audit/schemas/audit-schemas";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { authenticatedPasswordChangeSchema } from "../schemas/account-security-schemas";
import { updateAuthenticatedPassword } from "../adapters/supabase-account-security-provider";

export type AuthenticatedPasswordChangeProvider = (input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) => Promise<void>;

export type PasswordChangeAuditWriter = (input: AuditEventInput) => Promise<void>;

export type PasswordChangeDependencies = {
  provider?: AuthenticatedPasswordChangeProvider;
  audit?: PasswordChangeAuditWriter;
};

export async function changeAuthenticatedUserPassword(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PasswordChangeDependencies = {},
): Promise<void> {
  if (!actor || !actor.userId.trim()) {
    throw new ForbiddenError();
  }

  const parsed = authenticatedPasswordChangeSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Password change data is invalid");
  }

  const updatePassword = dependencies.provider ?? updateAuthenticatedPassword;

  try {
    await updatePassword({
      userId: actor.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
  } catch {
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
}
