import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import {
  PATIENT_SELF_MEASUREMENT_CURSOR_MAX_BYTES,
  PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH,
} from "../domain/patient-self-measurement";
import {
  patientSelfMeasurementCursorSchema,
  type PatientSelfMeasurementCursor,
} from "../schemas/patient-self-measurement-schemas";

type CursorScope = PatientSelfMeasurementCursor["scope"];

const PREFIX = "selfmeasure_v1_";

function canonical(value: PatientSelfMeasurementCursor): Buffer {
  return Buffer.from(JSON.stringify({
    version: 1,
    scope: value.scope,
    scopeId: value.scopeId,
    measurementId: value.measurementId,
    measuredAt: value.measuredAt,
  }), "utf8");
}

function tag(actor: ActorContext, bytes: Buffer): Buffer {
  try {
    return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
      .update(`demi.patient-self-measurement.cursor.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}\u0000measuredAt-id-desc:own50:care-team20\u0000`, "utf8")
      .update(bytes)
      .digest();
  } catch {
    throw new InfrastructureError();
  }
}

export function encodePatientSelfMeasurementCursor(
  actor: ActorContext,
  input: PatientSelfMeasurementCursor,
): string {
  const parsed = patientSelfMeasurementCursorSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const bytes = canonical(parsed.data);
  if (bytes.length > PATIENT_SELF_MEASUREMENT_CURSOR_MAX_BYTES) throw new ValidationError();
  const encoded = `${PREFIX}${bytes.toString("base64url")}.${tag(actor, bytes).toString("base64url")}`;
  if (encoded.length > PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH) throw new ValidationError();
  return encoded;
}

export function decodePatientSelfMeasurementCursor(
  actor: ActorContext,
  scope: CursorScope,
  scopeId: string,
  cursor: string,
): PatientSelfMeasurementCursor {
  if (cursor.length > PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH || !cursor.startsWith(PREFIX)) throw new ValidationError();
  const segments = cursor.slice(PREFIX.length).split(".");
  if (segments.length !== 2) throw new ValidationError();
  const [payload, signature] = segments;
  if (![payload, signature].every((value) => /^[A-Za-z0-9_-]+$/u.test(value) && Buffer.from(value, "base64url").toString("base64url") === value)) {
    throw new ValidationError();
  }
  const bytes = Buffer.from(payload, "base64url");
  const supplied = Buffer.from(signature, "base64url");
  if (bytes.length > PATIENT_SELF_MEASUREMENT_CURSOR_MAX_BYTES || supplied.length !== 32) throw new ValidationError();
  if (!timingSafeEqual(tag(actor, bytes), supplied)) throw new ValidationError();

  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ValidationError();
  }
  const parsed = patientSelfMeasurementCursorSchema.safeParse(raw);
  if (
    !parsed.success ||
    !canonical(parsed.data).equals(bytes) ||
    parsed.data.scope !== scope ||
    parsed.data.scopeId !== scopeId
  ) {
    throw new ValidationError();
  }
  return parsed.data;
}
