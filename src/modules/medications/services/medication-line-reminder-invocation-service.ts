import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { ConflictError, ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";
import { z } from "zod";

const secretSchema = z.string().min(32).max(1024);
const timestampSchema = z.string().regex(/^\d{13}$/u);
const nonceSchema = z.string().uuid();
const signatureSchema = z.string().regex(/^[a-f0-9]{64}$/iu);
const PATH = "/api/internal/line/medication-reminders/drain";
const MAX_CLOCK_SKEW_MS = 60_000;

type Headers = { timestamp: string | null; nonce: string | null; signature: string | null };
function digest(secret: string, timestamp: string, nonce: string): Buffer { return createHmac("sha256", secret).update(`POST\n${PATH}\n${timestamp}\n${nonce}`, "utf8").digest(); }

export function signMedicationLineReminderInvocation(input: { timestamp: string; nonce: string; secret: string }): string {
  return digest(secretSchema.parse(input.secret), timestampSchema.parse(input.timestamp), nonceSchema.parse(input.nonce)).toString("hex");
}

export async function verifyAndConsumeMedicationLineReminderInvocation(headers: Headers, input: { now?: Date; database?: PrismaClient; secret?: string } = {}): Promise<void> {
  const timestamp = timestampSchema.safeParse(headers.timestamp);
  const nonce = nonceSchema.safeParse(headers.nonce);
  const signature = signatureSchema.safeParse(headers.signature);
  const secret = secretSchema.safeParse(input.secret ?? process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET);
  if (!timestamp.success || !nonce.success || !signature.success || !secret.success) throw new ForbiddenError();
  const requestTime = Number(timestamp.data);
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isSafeInteger(now) || Math.abs(now - requestTime) > MAX_CLOCK_SKEW_MS) throw new ForbiddenError();
  const expected = digest(secret.data, timestamp.data, nonce.data);
  const provided = Buffer.from(signature.data, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new ForbiddenError();
  const database = input.database ?? getPrisma();
  await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ lastInvocationAt: Date }>>`SELECT "lastInvocationAt" FROM "MedicationLineReminderWorkerState" WHERE "id" = 1 FOR UPDATE`;
    const state = rows[0];
    if (!state) throw new InfrastructureError("Medication reminder worker state is unavailable");
    const issuedAt = new Date(requestTime);
    if (issuedAt.getTime() <= state.lastInvocationAt.getTime()) throw new ConflictError("Medication reminder worker invocation was already used");
    await transaction.medicationLineReminderWorkerState.update({ where: { id: 1 }, data: { lastInvocationAt: issuedAt } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const medicationLineReminderInvocationInternals = { digest, path: PATH, maxClockSkewMs: MAX_CLOCK_SKEW_MS };
