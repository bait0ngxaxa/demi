import "server-only";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import { getLineLiffId, isRecoveryLineEnabled } from "@/lib/env/server";
import { accountRecoveryTokenSchema, linePasswordRecoveryRequestSchema } from "@/modules/account-security/schemas/account-security-schemas";
import {
  completeLinePasswordRecovery,
  confirmLinePasswordRecoveryDelivery,
  getLinePasswordRecoveryAvailability,
  getLinePasswordRecoveryAvailabilityByCapabilityId,
  issueLinePasswordRecoveryCapability,
  LinePasswordRecoveryIdentityMismatchError,
  revokeLinePasswordRecoveryCapability,
  PasswordResetReconciliationRequiredError,
  type LinePasswordRecoveryAvailability,
  type MediatedPasswordResetDependencies,
} from "@/modules/account-security/services/mediated-password-reset-service";
import { createAuthAttemptThrottle, type AuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { LineMessagingClient, type LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import { verifyFreshLineIdToken, type VerifiedFreshLineIdentity } from "@/modules/line/adapters/line-login-client";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";
import { ProviderIdentityRejectedError } from "@/modules/account-security/adapters/supabase-account-security-provider";
import { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE } from "@/modules/line/domain/line-password-recovery-copy";

export { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };

export type LinePasswordRecoveryCompletionErrorCode =
  | "PASSWORD_POLICY_REJECTED"
  | "PASSWORD_REJECTED"
  | "LINK_UNAVAILABLE"
  | "LINE_PROOF_INVALID"
  | "RECONCILIATION_REQUIRED"
  | "OUTCOME_UNCERTAIN";

export class LinePasswordRecoveryCompletionError extends Error {
  constructor(readonly code: LinePasswordRecoveryCompletionErrorCode) {
    super("LINE password recovery could not be completed");
    this.name = "LinePasswordRecoveryCompletionError";
  }
}

export type LinePasswordRecoveryDependencies = Pick<
  MediatedPasswordResetDependencies,
  "database" | "now" | "createToken" | "createReplacementIdentity" | "deleteProviderIdentity" | "sendLineMessage"
> & {
  enabled?: boolean;
  lineLiffId?: string | null;
  attemptThrottle?: AuthAttemptThrottle;
  clientIpAddress?: string | null;
  verifyIdentity?: typeof verifyFreshLineIdToken;
  sendPush?: (lineUserId: string, message: string, retryKey: string) => Promise<LinePushResult>;
};

function databaseOf(dependencies: LinePasswordRecoveryDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function nowOf(dependencies: LinePasswordRecoveryDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function recoveryEnabled(dependencies: LinePasswordRecoveryDependencies): boolean {
  return dependencies.enabled ?? isRecoveryLineEnabled();
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function identityValue(input: unknown): string {
  const value = isUnknownRecord(input) ? input.nationalId : null;
  return typeof value === "string" && value.length <= 256 ? value.trim() || "invalid-national-id" : "invalid-national-id";
}

function genericAvailability(): LinePasswordRecoveryAvailability {
  return "EXPIRED";
}

function isVerifiedFreshIdentity(value: VerifiedFreshLineIdentity): boolean {
  return value.expiresAt.getTime() > value.verifiedAt.getTime();
}

export async function requestLinePasswordRecovery(
  input: unknown,
  dependencies: LinePasswordRecoveryDependencies = {},
): Promise<{ message: string }> {
  if (!recoveryEnabled(dependencies)) return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
  const database = databaseOf(dependencies);
  const now = nowOf(dependencies);
  const nationalId = identityValue(input);
  const identityHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId });
  const throttleInput = {
    scope: "RECOVERY_IDENTITY" as const,
    identityHash,
    clientIp: dependencies.clientIpAddress ?? null,
    now,
  };
  const attemptThrottle = dependencies.attemptThrottle ?? createAuthAttemptThrottle({ database });
  let resetId: string | null = null;
  try {
    if (await attemptThrottle.isBlocked(throttleInput)) return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    const parsed = linePasswordRecoveryRequestSchema.safeParse(input);
    if (!parsed.success) {
      await attemptThrottle.recordFailure(throttleInput);
      return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    }

    const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.nationalId });
    const person = await database.person.findUnique({
      where: { identityKeyHash },
      select: { user: { select: { id: true } } },
    });
    const userId = person?.user?.id;
    if (!userId) {
      await attemptThrottle.recordFailure(throttleInput);
      return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    }

    const lineLiffId = dependencies.lineLiffId === undefined ? getLineLiffId() : dependencies.lineLiffId;
    if (!lineLiffId || !/^\d{4,20}-[A-Za-z0-9]+$/u.test(lineLiffId)) {
      await attemptThrottle.recordFailure(throttleInput);
      return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    }
    const issued = await issueLinePasswordRecoveryCapability({ userId, identityKeyHash }, dependencies);
    if (!issued) {
      await attemptThrottle.recordFailure(throttleInput);
      return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    }
    resetId = issued.resetId;

    const recoveryUrl = `https://liff.line.me/${lineLiffId}/recover?capability=${encodeURIComponent(issued.resetId)}`;
    const deliveryMessage = `ตั้งรหัสผ่าน DEMI ใหม่ได้จากลิงก์นี้ ลิงก์ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว\n${recoveryUrl}\nหากคุณไม่ได้ขอ กรุณาติดต่อโรงพยาบาล`;
    const sendPush: (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }> =
      dependencies.sendPush ?? dependencies.sendLineMessage ??
      ((lineUserId: string, message: string, retryKey: string) => new LineMessagingClient().pushText(lineUserId, message, retryKey));
    const pushResult = await sendPush(issued.lineUserId, deliveryMessage, issued.resetId).catch(() => ({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" as const }));
    if (pushResult.kind !== "ACCEPTED" && pushResult.kind !== "DUPLICATE_ACCEPTED") {
      await revokeLinePasswordRecoveryCapability(issued.resetId, "PUSH_FAILED", dependencies).catch(() => undefined);
      await attemptThrottle.recordFailure(throttleInput).catch(() => undefined);
      return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
    }
    const deliveryConfirmed = await confirmLinePasswordRecoveryDelivery(issued.resetId, dependencies).catch(() => false);
    if (!deliveryConfirmed) {
      await revokeLinePasswordRecoveryCapability(issued.resetId, "DELIVERY_UNCONFIRMED", dependencies).catch(() => undefined);
    }
  } catch (error: unknown) {
    if (resetId) await revokeLinePasswordRecoveryCapability(resetId, "DELIVERY_UNCONFIRMED", dependencies).catch(() => undefined);
    if (error instanceof InfrastructureError) console.error("LINE password recovery request could not be completed");
    await attemptThrottle.recordFailure(throttleInput).catch(() => undefined);
  }
  return { message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };
}

const recoveryLocatorSchema = z.object({
  token: accountRecoveryTokenSchema.optional(),
  capabilityId: z.uuid().optional(),
}).strict().superRefine((input, context) => {
  if (Boolean(input.token) === Boolean(input.capabilityId)) {
    context.addIssue({ code: "custom", path: ["capabilityId"], message: "Exactly one recovery link identifier is required" });
  }
});

const openCapabilitySchema = recoveryLocatorSchema.extend({ idToken: z.string().min(20).max(16_384) });

export async function openLinePasswordRecovery(
  input: unknown,
  dependencies: LinePasswordRecoveryDependencies = {},
): Promise<{ status: LinePasswordRecoveryAvailability }> {
  if (!recoveryEnabled(dependencies)) return { status: genericAvailability() };
  const parsed = openCapabilitySchema.safeParse(input);
  if (!parsed.success) return { status: genericAvailability() };
  try {
    const identity = await (dependencies.verifyIdentity ?? verifyFreshLineIdToken)(parsed.data.idToken);
    if (!isVerifiedFreshIdentity(identity)) return { status: genericAvailability() };
    const fingerprint = createLineSubjectFingerprint(identity.subject).fingerprint;
    const status = parsed.data.token
      ? await getLinePasswordRecoveryAvailability(parsed.data.token, fingerprint, dependencies)
      : await getLinePasswordRecoveryAvailabilityByCapabilityId(parsed.data.capabilityId, fingerprint, dependencies);
    return { status };
  } catch {
    return { status: genericAvailability() };
  }
}

const completeCapabilitySchema = recoveryLocatorSchema.extend({
  idToken: z.string().min(20).max(16_384),
  newPassword: userOwnedPasswordSchema,
  passwordConfirmation: userOwnedPasswordSchema,
}).strict().superRefine((input, context) => {
  if (input.newPassword !== input.passwordConfirmation) {
    context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Password confirmation does not match" });
  }
});

export async function completeLinePasswordRecoveryWithIdentityToken(
  input: unknown,
  dependencies: LinePasswordRecoveryDependencies = {},
): Promise<void> {
  if (!recoveryEnabled(dependencies)) throw new LinePasswordRecoveryCompletionError("LINK_UNAVAILABLE");
  const parsed = completeCapabilitySchema.safeParse(input);
  if (!parsed.success) throw new LinePasswordRecoveryCompletionError("LINK_UNAVAILABLE");
  const { idToken, ...completion } = parsed.data;
  let identity: VerifiedFreshLineIdentity;
  try {
    identity = await (dependencies.verifyIdentity ?? verifyFreshLineIdToken)(idToken);
  } catch {
    throw new LinePasswordRecoveryCompletionError("LINE_PROOF_INVALID");
  }
  if (!isVerifiedFreshIdentity(identity)) throw new LinePasswordRecoveryCompletionError("LINE_PROOF_INVALID");
  const fingerprint = createLineSubjectFingerprint(identity.subject).fingerprint;
  try {
    await completeLinePasswordRecovery(completion, fingerprint, dependencies);
  } catch (error: unknown) {
    if (error instanceof ProviderIdentityRejectedError) {
      throw new LinePasswordRecoveryCompletionError(
        error.reason === "PASSWORD_POLICY" ? "PASSWORD_POLICY_REJECTED" : "PASSWORD_REJECTED",
      );
    }
    if (error instanceof PasswordResetReconciliationRequiredError) {
      throw new LinePasswordRecoveryCompletionError("RECONCILIATION_REQUIRED");
    }
    if (error instanceof LinePasswordRecoveryIdentityMismatchError) {
      throw new LinePasswordRecoveryCompletionError("LINE_PROOF_INVALID");
    }
    if (error instanceof ForbiddenError) throw new LinePasswordRecoveryCompletionError("LINK_UNAVAILABLE");
    if (error instanceof NotFoundError || error instanceof ConflictError || error instanceof ValidationError) {
      throw new LinePasswordRecoveryCompletionError("LINK_UNAVAILABLE");
    }
    if (error instanceof InfrastructureError) throw new LinePasswordRecoveryCompletionError("OUTCOME_UNCERTAIN");
    throw new LinePasswordRecoveryCompletionError("OUTCOME_UNCERTAIN");
  }
}
