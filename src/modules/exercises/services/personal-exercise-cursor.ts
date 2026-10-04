import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import { EXERCISE_CURSOR_MAX_BYTES, EXERCISE_CURSOR_MAX_LENGTH } from "../domain/personal-exercise";
import { exerciseCursorSchema, type ExerciseCursor } from "../schemas/personal-exercise-schemas";

const PREFIX = "exercisecur_v1_";
function canonical(value: ExerciseCursor): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, patientProfileId: value.patientProfileId,
    id: value.id, occurredOn: value.occurredOn, createdAt: value.createdAt, updatedAt: value.updatedAt }), "utf8");
}
function tag(actor: ActorContext, bytes: Buffer): Buffer {
  try {
    return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
      .update(`demi.personal-exercise.cursor.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}\u0000occurredOn-createdAt-id-desc:50:no-filter\u0000`, "utf8")
      .update(bytes).digest();
  } catch { throw new InfrastructureError(); }
}
export function encodeExerciseCursor(actor: ActorContext, input: ExerciseCursor): string {
  const parsed = exerciseCursorSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const bytes = canonical(parsed.data);
  if (bytes.length > EXERCISE_CURSOR_MAX_BYTES) throw new ValidationError();
  const result = `${PREFIX}${bytes.toString("base64url")}.${tag(actor, bytes).toString("base64url")}`;
  if (result.length > EXERCISE_CURSOR_MAX_LENGTH) throw new ValidationError();
  return result;
}
export function decodeExerciseCursor(actor: ActorContext, owner: string, cursor: string): ExerciseCursor {
  if (cursor.length > EXERCISE_CURSOR_MAX_LENGTH || !cursor.startsWith(PREFIX)) throw new ValidationError();
  const segments = cursor.slice(PREFIX.length).split(".");
  if (segments.length !== 2) throw new ValidationError();
  const [payload, signature] = segments;
  if (![payload, signature].every((value) => /^[A-Za-z0-9_-]+$/u.test(value) && Buffer.from(value, "base64url").toString("base64url") === value)) throw new ValidationError();
  const bytes = Buffer.from(payload, "base64url");
  const supplied = Buffer.from(signature, "base64url");
  if (bytes.length > EXERCISE_CURSOR_MAX_BYTES || supplied.length !== 32) throw new ValidationError();
  if (!timingSafeEqual(tag(actor, bytes), supplied)) throw new ValidationError();
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw new ValidationError(); }
  const parsed = exerciseCursorSchema.safeParse(raw);
  if (!parsed.success || !canonical(parsed.data).equals(bytes) || parsed.data.patientProfileId !== owner) throw new ValidationError();
  return parsed.data;
}
