import "server-only";

import { z } from "zod";

import { ValidationError } from "@/shared/errors/application-error";

import type { WorkforceKind, WorkforceListInput } from "../schemas/workforce-schemas";

const cursorSchema = z.object({
  hospitalId: z.uuid(), kind: z.enum(["HOSPITAL_MEMBER", "OSM"]), search: z.string().max(120),
  status: z.string().nullable(), createdAt: z.iso.datetime(), id: z.uuid(),
}).strict();

export function readWorkforceCursor(
  cursor: string | undefined, kind: WorkforceKind, input: WorkforceListInput,
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const parsed = cursorSchema.parse(decoded);
    if (parsed.hospitalId !== input.targetHospitalId || parsed.kind !== kind ||
      parsed.search !== (input.search ?? "") || parsed.status !== (input.status ?? null)) {
      throw new Error("Cursor context changed");
    }
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new ValidationError("Workforce pagination context is invalid");
  }
}

export function writeWorkforceCursor(
  row: { createdAt: Date; id: string } | undefined, kind: WorkforceKind, input: WorkforceListInput,
): string | null {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ hospitalId: input.targetHospitalId, kind,
    search: input.search ?? "", status: input.status ?? null,
    createdAt: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}
