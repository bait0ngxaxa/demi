import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getServerEnv } from "@/lib/env/server";
import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import type {
  WorkAppointmentFilters,
  WorkAppointmentTab,
} from "../schemas/work-appointment-schemas";
import { appointmentTypeSchema } from "../schemas/appointment-schemas";

const CURSOR_PREFIX = "workappt_cur_v1_";
const CURSOR_MAX_LENGTH = 1024;
const CURSOR_TTL_MS = 12 * 60 * 60 * 1000;

export type WorkAppointmentCursorPosition = {
  sortAt: Date;
  appointmentId: string;
};

export type WorkAppointmentCursorContext = {
  actorId: string;
  hospitalId: string;
  tab: WorkAppointmentTab;
  filters: WorkAppointmentFilters;
};

const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    context: z
      .object({
        actorId: z.uuid(),
        hospitalId: z.uuid(),
        tab: z.enum(["UPCOMING", "HISTORY", "PENDING_REQUESTS", "AWAITING_MY_ACCEPTANCE"]),
        pageSize: z.literal(25),
        filters: z
          .object({
            dateFrom: z.iso.date().optional(),
            dateTo: z.iso.date().optional(),
            status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
            type: appointmentTypeSchema.optional(),
            locationType: z.enum(["CLINIC", "ONLINE", "HOME_VISIT", "OTHER"]).optional(),
            responsibleUserId: z.uuid().optional(),
            awaitingOsmAcceptance: z.literal("true").optional(),
          })
          .strict(),
      })
      .strict(),
    sortAt: z.iso.datetime(),
    appointmentId: z.uuid(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

function cursorSigningSecret(): string {
  try {
    return getServerEnv().IDENTITY_HASH_SECRET;
  } catch {
    throw new InfrastructureError("Appointment cursor signing is not configured");
  }
}

function canonicalPayload(payload: CursorPayload): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function cursorTag(encodedPayload: string): Buffer {
  return createHmac("sha256", cursorSigningSecret())
    .update("demi.appointments.work-cursor.v1\u0000", "utf8")
    .update(encodedPayload, "utf8")
    .digest();
}

function cursorContext(
  context: WorkAppointmentCursorContext,
): CursorPayload["context"] {
  return {
    actorId: context.actorId.toLowerCase(),
    hospitalId: context.hospitalId.toLowerCase(),
    tab: context.tab,
    pageSize: 25,
    filters: {
      ...(context.filters.dateFrom === undefined ? {} : { dateFrom: context.filters.dateFrom }),
      ...(context.filters.dateTo === undefined ? {} : { dateTo: context.filters.dateTo }),
      ...(context.filters.status === undefined ? {} : { status: context.filters.status }),
      ...(context.filters.type === undefined ? {} : { type: context.filters.type }),
      ...(context.filters.locationType === undefined ? {} : { locationType: context.filters.locationType }),
      ...(context.filters.responsibleUserId === undefined
        ? {}
        : { responsibleUserId: context.filters.responsibleUserId.toLowerCase() }),
      ...(context.filters.awaitingOsmAcceptance === undefined
        ? {}
        : { awaitingOsmAcceptance: context.filters.awaitingOsmAcceptance }),
    },
  };
}

export function encodeWorkAppointmentCursor(
  position: WorkAppointmentCursorPosition,
  context: WorkAppointmentCursorContext,
): string {
  const parsed = cursorPayloadSchema.safeParse({
    version: 1,
    context: cursorContext(context),
    sortAt: position.sortAt.toISOString(),
    appointmentId: position.appointmentId.toLowerCase(),
    expiresAt: Date.now() + CURSOR_TTL_MS,
  });
  if (!parsed.success) {
    throw new InfrastructureError("Appointment cursor could not be created");
  }

  const encodedPayload = canonicalPayload(parsed.data).toString("base64url");
  const cursor = CURSOR_PREFIX + encodedPayload + "." + cursorTag(encodedPayload).toString("base64url");
  if (cursor.length > CURSOR_MAX_LENGTH) {
    throw new InfrastructureError("Appointment cursor is too large");
  }

  return cursor;
}

export function decodeWorkAppointmentCursor(
  value: string | undefined,
  context: WorkAppointmentCursorContext,
): WorkAppointmentCursorPosition | null {
  if (value === undefined) return null;

  try {
    if (value.length > CURSOR_MAX_LENGTH || !value.startsWith(CURSOR_PREFIX)) {
      throw new Error("Malformed appointment cursor");
    }

    const segments = value.slice(CURSOR_PREFIX.length).split(".");
    if (segments.length !== 2) throw new Error("Malformed appointment cursor");
    const [encodedPayload, suppliedSignature] = segments;
    if (
      !encodedPayload ||
      !suppliedSignature ||
      !/^[A-Za-z0-9_-]+$/u.test(encodedPayload) ||
      !/^[A-Za-z0-9_-]+$/u.test(suppliedSignature) ||
      Buffer.from(encodedPayload, "base64url").toString("base64url") !== encodedPayload ||
      Buffer.from(suppliedSignature, "base64url").toString("base64url") !== suppliedSignature
    ) {
      throw new Error("Malformed appointment cursor");
    }

    const expectedSignature = cursorTag(encodedPayload);
    const actualSignature = Buffer.from(suppliedSignature, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new Error("Invalid appointment cursor signature");
    }

    const payloadBytes = Buffer.from(encodedPayload, "base64url");
    const decoded: unknown = JSON.parse(payloadBytes.toString("utf8"));
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success || !canonicalPayload(parsed.data).equals(payloadBytes)) {
      throw new Error("Invalid appointment cursor payload");
    }

    if (
      JSON.stringify(parsed.data.context) !== JSON.stringify(cursorContext(context)) ||
      parsed.data.expiresAt <= Date.now()
    ) {
      throw new Error("Appointment cursor context or expiry is invalid");
    }

    return {
      sortAt: new Date(parsed.data.sortAt),
      appointmentId: parsed.data.appointmentId,
    };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) throw error;
    throw new NotFoundError();
  }
}
