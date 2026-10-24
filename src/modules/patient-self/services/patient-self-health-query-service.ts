import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { calculateBodyMassIndex } from "@/modules/patient-program-rounds/domain/body-mass-index";
import { ApplicationError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import { resolveOwnPatientRelationshipContext, type PatientSelfQueryDependencies } from "./patient-self-query-service";

const factSchema = z.object({
  field: z.enum(["weight", "heightCm", "waistCircumference"]),
  value: z.number().finite().positive(),
  date: z.date(),
  source: z.string(),
});

export type PatientHealthMeasurement = { value: number; date: Date; source: string };
export type PatientHealthMeasurements = {
  weight: PatientHealthMeasurement | null;
  heightCm: PatientHealthMeasurement | null;
  waistCircumference: PatientHealthMeasurement | null;
  bmi: (PatientHealthMeasurement & { heightDate: Date; heightSource: string }) | null;
};

/** One bounded result set across all four staff sources; SELF observations are deliberately absent.
 * Latest means clinical date (service date when present), then recorded time, then source/id for stable ties.
 */
export async function getOwnLatestStaffMeasurements(
  actor: ActorContext | null | undefined, relationshipId: unknown, dependencies: PatientSelfQueryDependencies = {},
): Promise<PatientHealthMeasurements> {
  const database = dependencies.database ?? getPrisma();
  const relationship = await resolveOwnPatientRelationshipContext(actor, relationshipId, { database });
  try {
    const id = relationship.relationshipId;
    const rows = factSchema.array().parse(await database.$queryRaw<unknown>(Prisma.sql`
      WITH records AS (
        SELECT b.id, b.weight, b."heightCm", b."waistCircumference",
          b."recordedOn"::timestamp AS date, b."createdAt" AS recorded, 'ข้อมูลตั้งต้น'::text AS source
        FROM "PatientBaseline" b WHERE b."patientHospitalRelationshipId" = ${id}::uuid
        UNION ALL
        SELECT v.id, v.weight, v."heightCm", v."waistCircumference",
          v."serviceDate"::timestamp, v."recordedAt", 'บริการครั้งที่ ' || v."roundNumber"
        FROM "PatientProgramRoundVitals" v WHERE v."patientHospitalRelationshipId" = ${id}::uuid
        UNION ALL
        SELECT f.id, f.weight, f."heightCm", f."waistCircumference",
          COALESCE(f."serviceDate"::timestamp, f."recordedAt" AT TIME ZONE 'Asia/Bangkok'), f."recordedAt", 'ติดตามผล'
        FROM "PatientFollowup" f WHERE f."patientHospitalRelationshipId" = ${id}::uuid
        UNION ALL
        SELECT a.id, a.weight, NULL::double precision, a."waistCircumference",
          COALESCE(a."serviceDate"::timestamp, a."recordedAt" AT TIME ZONE 'Asia/Bangkok'), a."recordedAt", 'ประเมินสุดท้าย'
        FROM "PatientFinalAssessment" a WHERE a."patientHospitalRelationshipId" = ${id}::uuid
      )
      SELECT DISTINCT ON (fact.field) fact.field, fact.value, r.date, r.source
      FROM records r CROSS JOIN LATERAL (VALUES
        ('weight', r.weight), ('heightCm', r."heightCm"), ('waistCircumference', r."waistCircumference")
      ) AS fact(field, value)
      WHERE fact.value > 0 AND fact.value < 'Infinity'::double precision
      ORDER BY fact.field, r.date DESC, r.recorded DESC, r.source DESC, r.id DESC
    `));
    const result: PatientHealthMeasurements = { weight: null, heightCm: null, waistCircumference: null, bmi: null };
    for (const { field, value, date, source } of rows) result[field] = { value, date, source };
    const bmi = calculateBodyMassIndex(result.weight?.value, result.heightCm?.value);
    if (bmi !== null && result.weight && result.heightCm) {
      result.bmi = { value: bmi, date: result.weight.date, source: result.weight.source,
        heightDate: result.heightCm.date, heightSource: result.heightCm.source };
    }
    return result;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("ไม่สามารถโหลดค่าร่างกายล่าสุดได้");
  }
}

export type PatientSelfAssignedOsm = { displayName: string | null; contactPhone: string | null };

/** Minimal live care contact. Historical care remains readable elsewhere, but ended relationships have no current OSM. */
export async function getOwnCurrentAssignedOsm(
  actor: ActorContext | null | undefined, relationshipId: unknown, dependencies: PatientSelfQueryDependencies = {},
): Promise<PatientSelfAssignedOsm | null> {
  const database = dependencies.database ?? getPrisma();
  const relationship = await resolveOwnPatientRelationshipContext(actor, relationshipId, { database });
  if (relationship.careEndedAt !== null || relationship.hospitalStatus !== "ACTIVE") throw new NotFoundError();
  try {
    const hospitalScope = { status: "ACTIVE" as const, hospital: { status: "ACTIVE" as const,
      patientRelationships: { some: { id: relationship.relationshipId, endedAt: null } } } };
    const assignment = await database.patientOsmAssignment.findFirst({
      where: { patientHospitalRelationshipId: relationship.relationshipId, endedAt: null,
        patientHospitalRelationship: { endedAt: null, hospital: { status: "ACTIVE" } },
        osmUser: { status: "ACTIVE", roles: { some: { role: "OSM" } }, osmHospitalRelationships: { some: hospitalScope } } },
      select: { osmUser: { select: { person: { select: { givenName: true, familyName: true } },
        osmHospitalRelationships: { where: hospitalScope, take: 1, select: { contactPhone: true } } } } },
    });
    if (!assignment) return null;
    return {
      displayName: [assignment.osmUser.person.givenName, assignment.osmUser.person.familyName].filter(Boolean).join(" ") || null,
      contactPhone: assignment.osmUser.osmHospitalRelationships[0]?.contactPhone ?? null,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("ไม่สามารถโหลดข้อมูล อสม.ผู้ดูแลได้");
  }
}
