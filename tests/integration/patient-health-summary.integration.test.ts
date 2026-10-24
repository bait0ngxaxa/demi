import { randomUUID } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getOwnCurrentAssignedOsm, getOwnLatestStaffMeasurements } from "@/modules/patient-self/services/patient-self-health-query-service";
import { NotFoundError } from "@/shared/errors/application-error";

const db = getPrisma();
const rollback = new Error("rollback fixture");
async function inFixture(test: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await db.$transaction(async (tx) => { await test(tx); throw rollback; }, { timeout: 15000 });
  } catch (error: unknown) { if (error !== rollback) throw error; }
}
async function fixture(tx: Prisma.TransactionClient) {
  const person = await tx.person.create({ data: { identityKeyHash: randomUUID(), givenName: "คนไข้", familyName: "ทดสอบ" } });
  const user = await tx.user.create({ data: { personId: person.id, status: "ACTIVE", authSubject: randomUUID(), roles: { create: { role: "PATIENT" } } } });
  const actor: ActorContext = { userId: user.id, personId: person.id, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
  const profile = await tx.patientProfile.create({ data: { personId: person.id } });
  const hospital = await tx.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "ทดสอบ PH-1", status: "ACTIVE" } });
  const relationship = await tx.patientHospitalRelationship.create({ data: { hospitalId: hospital.id, patientProfileId: profile.id } });
  return { actor, profile, hospital, relationship };
}
const day = (value: number): Date => new Date(`2026-10-${String(value).padStart(2, "0")}T00:00:00Z`);

describe("PH-1 actual PostgreSQL staff facts and current OSM", () => {
  afterAll(async () => { await db.$disconnect(); });
  it("selects the newest non-null field across all four staff sources, carries height, and excludes SELF and other relationships", async () => {
    await inFixture(async (tx) => {
      const f = await fixture(tx);
      const scope = { patientHospitalRelationshipId: f.relationship.id };
      const deps = { database: tx };
      await tx.patientBaseline.create({ data: { ...scope, recordedByUserId: f.actor.userId, recordedOn: day(1), weight: 90, heightCm: 160, waistCircumference: 100 } });
      expect(await getOwnLatestStaffMeasurements(f.actor, f.relationship.id, deps)).toMatchObject({
        weight: { value: 90, source: "ข้อมูลตั้งต้น" }, heightCm: { value: 160, source: "ข้อมูลตั้งต้น" },
        waistCircumference: { value: 100, source: "ข้อมูลตั้งต้น" }, bmi: { value: 35.2 },
      });
      const program = await tx.patientProgram.create({ data: { ...scope, createdByUserId: f.actor.userId } });
      await tx.patientProgramRoundVitals.create({ data: { ...scope, patientProgramId: program.id, roundNumber: 1, serviceDate: day(3), weight: 85,
        recordedByUserId: f.actor.userId, submissionNonce: randomUUID() } });
      expect((await getOwnLatestStaffMeasurements(f.actor, f.relationship.id, deps)).weight).toMatchObject({ value: 85, source: "บริการครั้งที่ 1" });
      await tx.patientFollowup.create({ data: { ...scope, roundNumber: 1, serviceDate: day(5), recordedAt: day(6), weight: 80, heightCm: 165,
        createdByUserId: f.actor.userId, submissionNonce: randomUUID(), submissionRequestHash: "a".repeat(64) } });
      await tx.patientFinalAssessment.create({ data: { ...scope, patientProgramId: program.id, serviceDate: day(7), recordedAt: day(8), weight: null,
        waistCircumference: 88, recordedByUserId: f.actor.userId } });
      // A late-entered older service does not displace a newer clinical measurement.
      await tx.patientProgramRoundVitals.create({ data: { ...scope, patientProgramId: program.id, roundNumber: 2, serviceDate: day(2), weight: 99,
        recordedAt: day(10), recordedByUserId: f.actor.userId, submissionNonce: randomUUID() } });
      await tx.patientSelfMeasurement.create({ data: { patientProfileId: f.profile.id, measuredAt: day(15), weight: 50, submissionNonce: randomUUID() } });
      const foreign = await fixture(tx);
      await tx.patientBaseline.create({ data: { patientHospitalRelationshipId: foreign.relationship.id, recordedByUserId: foreign.actor.userId,
        recordedOn: day(20), weight: 200, heightCm: 200, waistCircumference: 200 } });
      expect(await getOwnLatestStaffMeasurements(f.actor, f.relationship.id, deps)).toEqual({
        weight: { value: 80, date: day(5), source: "ติดตามผล" },
        heightCm: { value: 165, date: day(5), source: "ติดตามผล" },
        waistCircumference: { value: 88, date: day(7), source: "ประเมินสุดท้าย" },
        bmi: { value: 29.4, date: day(5), source: "ติดตามผล", heightDate: day(5), heightSource: "ติดตามผล" },
      });
      await expect(getOwnLatestStaffMeasurements(f.actor, foreign.relationship.id, deps)).rejects.toBeInstanceOf(NotFoundError);
      await tx.patientFollowup.create({ data: { ...scope, roundNumber: 2, recordedAt: day(9), weight: 75,
        createdByUserId: f.actor.userId, submissionNonce: randomUUID(), submissionRequestHash: "b".repeat(64) } });
      const legacy = await getOwnLatestStaffMeasurements(f.actor, f.relationship.id, deps);
      expect(legacy.weight).toEqual({ value: 75, source: "ติดตามผล", date: new Date("2026-10-09T07:00:00Z") });
      expect(legacy.heightCm?.value).toBe(165);
      expect(legacy.bmi?.value).toBe(27.5);
    });
  });
  it("returns only the live exact-Hospital OSM phone, then hides ended/suspended assignments and rejects ended SELF care", async () => {
    await inFixture(async (tx) => {
      const f = await fixture(tx);
      const osmPerson = await tx.person.create({ data: { identityKeyHash: randomUUID(), givenName: "อสม.", familyName: "ทดสอบ" } });
      const osm = await tx.user.create({ data: { personId: osmPerson.id, status: "ACTIVE", authSubject: randomUUID(), roles: { create: { role: "OSM" } } } });
      const osmRelationship = await tx.osmHospitalRelationship.create({ data: { hospitalId: f.hospital.id, userId: osm.id, status: "ACTIVE", contactPhone: "0812345678" } });
      await tx.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: f.relationship.id, osmUserId: osm.id, assignedByUserId: f.actor.userId } });
      const deps = { database: tx };
      const otherHospital = await tx.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "อีกโรงพยาบาล", status: "ACTIVE" } });
      await tx.osmHospitalRelationship.create({ data: { hospitalId: otherHospital.id, userId: osm.id, status: "ACTIVE", contactPhone: "0899999999" } });
      expect(await getOwnCurrentAssignedOsm(f.actor, f.relationship.id, deps)).toEqual({ displayName: "อสม. ทดสอบ", contactPhone: "0812345678" });
      await tx.osmHospitalRelationship.update({ where: { id: osmRelationship.id }, data: { contactPhone: null } });
      expect(await getOwnCurrentAssignedOsm(f.actor, f.relationship.id, deps)).toEqual({ displayName: "อสม. ทดสอบ", contactPhone: null });
      await tx.osmHospitalRelationship.update({ where: { id: osmRelationship.id }, data: { status: "SUSPENDED" } });
      expect(await getOwnCurrentAssignedOsm(f.actor, f.relationship.id, deps)).toBeNull();
      await tx.patientHospitalRelationship.update({ where: { id: f.relationship.id }, data: { endedAt: day(20), endedByUserId: f.actor.userId, endReason: "ทดสอบ" } });
      await expect(getOwnCurrentAssignedOsm(f.actor, f.relationship.id, deps)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
