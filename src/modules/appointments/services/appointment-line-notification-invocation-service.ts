import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import { ConflictError, ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

const secretSchema = z.string().min(32).max(1024);
const timestampSchema = z.string().regex(/^[0-9]{13}$/u);
const nonceSchema = z.string().uuid();
const signatureSchema = z.string().regex(/^[a-f0-9]{64}$/iu);
const MAX_CLOCK_SKEW_MS = 60_000;
const INVOCATION_PATH = "/api/internal/line/appointment-notifications/drain";

export type AppointmentNotificationInvocationHeaders = {
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
};

function digestInvocation(secret: string, timestamp: string, nonce: string): Buffer {
  return createHmac("sha256", secret)
    .update(`POST\n${INVOCATION_PATH}\n${timestamp}\n${nonce}`, "utf8")
    .digest();
}

export function signAppointmentLineNotificationInvocation(input: {
  timestamp: string;
  nonce: string;
  secret: string;
}): string {
  const timestamp = timestampSchema.parse(input.timestamp);
  const nonce = nonceSchema.parse(input.nonce);
  const secret = secretSchema.parse(input.secret);
  return digestInvocation(secret, timestamp, nonce).toString("hex");
}

export async function verifyAndConsumeAppointmentLineNotificationInvocation(
  headers: AppointmentNotificationInvocationHeaders,
  input: { now?: Date; database?: PrismaClient; secret?: string } = {},
): Promise<void> {
  const timestamp = timestampSchema.safeParse(headers.timestamp);
  const nonce = nonceSchema.safeParse(headers.nonce);
  const signature = signatureSchema.safeParse(headers.signature);
  const secret = secretSchema.safeParse(input.secret ?? process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET);
  if (!timestamp.success || !nonce.success || !signature.success || !secret.success) {
    throw new ForbiddenError();
  }

  const requestTime = Number(timestamp.data);
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isSafeInteger(now) || Math.abs(now - requestTime) > MAX_CLOCK_SKEW_MS) {
    throw new ForbiddenError();
  }

  const expected = digestInvocation(secret.data, timestamp.data, nonce.data);
  const provided = Buffer.from(signature.data, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ForbiddenError();
  }

  const database = input.database ?? getPrisma();
  await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ lastInvocationAt: Date }>>`
      SELECT "lastInvocationAt"
      FROM "AppointmentLineNotificationWorkerState"
      WHERE "id" = 1
      FOR UPDATE
    `;
    const state = rows[0];
    if (!state) throw new InfrastructureError("Notification worker state is unavailable");

    const issuedAt = new Date(requestTime);
    if (issuedAt.getTime() <= state.lastInvocationAt.getTime()) {
      throw new ConflictError("Notification worker invocation was already used");
    }

    await transaction.appointmentLineNotificationWorkerState.update({
      where: { id: 1 },
      data: { lastInvocationAt: issuedAt },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const appointmentLineNotificationInvocationInternals = {
  digestInvocation,
  maxClockSkewMs: MAX_CLOCK_SKEW_MS,
};
