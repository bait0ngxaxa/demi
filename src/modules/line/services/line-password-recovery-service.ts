import "server-only";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import { getLineLiffId, isRecoveryLineEnabled } from "@/lib/env/server";
import { linePasswordRecoveryRequestSchema } from "@/modules/account-security/schemas/account-security-schemas";
import {
  completeLinePasswordRecovery,
  confirmLinePasswordRecoveryDelivery,
  getLinePasswordRecoveryAvailability,
  issueLinePasswordRecoveryCapability,
  revokeLinePasswordRecoveryCapability,
  type LinePasswordRecoveryAvailability,
  type MediatedPasswordResetDependencies,
} from "@/modules/account-security/services/mediated-password-reset-service";
import { accountRecoveryCompletionSchema, accountRecoveryTokenSchema } from "@/modules/account-security/schemas/account-security-schemas";
import { createAuthAttemptThrottle, type AuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { LineMessagingClient, type LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import { verifyFreshLineIdToken, type VerifiedFreshLineIdentity } from "@/modules/line/adapters/line-login-client";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import { InfrastructureError } from "@/shared/errors/application-error";
import { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE } from "@/modules/line/domain/line-password-recovery-copy";

export { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE };

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

    const recoveryUrl = `https://liff.line.me/${lineLiffId}/recover#${encodeURIComponent(issued.token)}`;
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

const openCapabilitySchema = z.object({ token: accountRecoveryTokenSchema, idToken: z.string().min(20).max(16_384) }).strict();

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
    const status = await getLinePasswordRecoveryAvailability(parsed.data.token, fingerprint, dependencies);
    return { status };
  } catch {
    return { status: genericAvailability() };
  }
}

const completeCapabilitySchema = accountRecoveryCompletionSchema.extend({ idToken: z.string().min(20).max(16_384) }).strict();

export async function completeLinePasswordRecoveryWithIdentityToken(
  input: unknown,
  dependencies: LinePasswordRecoveryDependencies = {},
): Promise<void> {
  if (!recoveryEnabled(dependencies)) throw new Error("LINE password recovery is unavailable");
  const parsed = completeCapabilitySchema.safeParse(input);
  if (!parsed.success) throw new Error("LINE password recovery is invalid");
  const { idToken, ...completion } = parsed.data;
  const identity = await (dependencies.verifyIdentity ?? verifyFreshLineIdToken)(idToken);
  if (!isVerifiedFreshIdentity(identity)) throw new Error("LINE identity expired");
  const fingerprint = createLineSubjectFingerprint(identity.subject).fingerprint;
  await completeLinePasswordRecovery(completion, fingerprint, dependencies);
}
