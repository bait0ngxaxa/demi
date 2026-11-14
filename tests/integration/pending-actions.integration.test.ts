import { randomUUID } from "node:crypto";
import { type Prisma, type Role } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { calculatePendingActions } from "@/modules/pending-actions/services/pending-action-service";
import { countWorkAppointmentsAwaitingMyAcceptance, listWorkAppointments } from "@/modules/appointments/services/work-appointment-query-service";
import { createActorContextStore, resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";

const db = getPrisma();
const now = new Date("2026-11-14T00:00:00Z");
const future = new Date("2026-11-15T00:00:00Z");
afterAll(async () => { await db.$disconnect(); });

/** Every fixture and assertion shares a rollback-only transaction in the guarded disposable database. */
async function isolated(test: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const rollback = new Error("rollback pending-action fixtures");
  try {
    await db.$transaction(async (tx) => { await test(tx); throw rollback; });
  } catch (error: unknown) {
    if (error !== rollback) throw error;
  }
}

async function account(tx: Prisma.TransactionClient, roles: Role[]): Promise<{ id: string; personId: string }> {
  const person = await tx.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "งานค้าง" } });
  return tx.user.create({ data: { personId: person.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } }, select: { id: true, personId: true } });
}

async function fixture(tx: Prisma.TransactionClient, membershipType: "OWNER" | "MEMBER" = "OWNER") {
  const staff = await account(tx, ["HOSPITAL"]);
  const osm = await account(tx, ["OSM"]);
  const patient = await account(tx, ["PATIENT"]);
  const hospital = await tx.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "โรงพยาบาลทดสอบ", status: "ACTIVE" } });
  await tx.hospitalMembership.create({ data: { userId: staff.id, hospitalId: hospital.id, membershipType, status: "ACTIVE" } });
  await tx.osmHospitalRelationship.create({ data: { userId: osm.id, hospitalId: hospital.id, status: "ACTIVE" } });
  const profile = await tx.patientProfile.create({ data: { personId: patient.personId } });
  const relationship = await tx.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospital.id } });
  const appointment = await tx.patientAppointment.create({ data: {
    patientHospitalRelationshipId: relationship.id, createdByUserId: staff.id, assignedOsmUserId: osm.id,
    scheduledAt: future, updatedAt: now, type: "FOLLOW_UP", locationType: "CLINIC", submissionNonce: randomUUID(),
  } });
  const request = await tx.patientServiceRequest.create({ data: {
    patientHospitalRelationshipId: relationship.id, hospitalId: hospital.id, requestedByUserId: patient.id, serviceCode: "SCREENING",
  } });
  return { staff, osm, patient, hospital, relationship, appointment, request };
}

describe("pending actions against authoritative PostgreSQL tables", () => {
  it.each(["OWNER", "MEMBER"] as const)("counts %s work once, excludes other Hospitals, survives viewing and disappears on completion", async (membershipType) => isolated(async (tx) => {
    const f = await fixture(tx, membershipType);
    await fixture(tx);
    const source = { appointmentId: f.appointment.id, sourceAppointmentUpdatedAt: f.appointment.updatedAt, submittedByUserId: f.patient.id, source: "PATIENT_SELF" as const };
    await tx.patientAppointmentRescheduleRequest.create({ data: { ...source, submissionNonce: randomUUID(), preferredDatetimes: [future], reason: "ขอเลื่อน" } });
    await tx.patientAppointmentCancellationRequest.create({ data: { ...source, submissionNonce: randomUUID() } });
    const counts = async (): Promise<number[]> => (await calculatePendingActions(f.staff.id, tx, now)).map(({ count }) => count);
    expect(await counts()).toEqual([1, 1]);
    const access = await resolveActorAccessByUserId(f.staff.id, createActorContextStore(tx));
    if (access.status !== "AUTHORIZED") throw new Error("fixture actor missing");
    const list = await listWorkAppointments(access.actor, { hospitalId: f.hospital.id, tab: "PENDING_REQUESTS" }, { database: tx, now: () => now });
    expect(list.items.map(({ appointmentId }) => appointmentId)).toEqual([f.appointment.id]);
    expect(await counts()).toEqual([1, 1]);
    await tx.patientServiceRequest.update({ where: { id: f.request.id }, data: { status: "WITHDRAWN", withdrawnAt: now, withdrawnByUserId: f.patient.id } });
    await tx.patientAppointmentRescheduleRequest.updateMany({ where: { appointmentId: f.appointment.id }, data: { status: "REJECTED", resolvedByUserId: f.staff.id, resolvedAt: now, rejectionReason: "ไม่สะดวก" } });
    await tx.patientAppointmentCancellationRequest.updateMany({ where: { appointmentId: f.appointment.id }, data: { status: "REJECTED", resolvedByUserId: f.staff.id, resolvedAt: now } });
    expect(await counts()).toEqual([0, 0]);
  }));

  it("drops revoked memberships and suspended Hospitals without leaking their queues", async () => isolated(async (tx) => {
    const f = await fixture(tx);
    expect((await calculatePendingActions(f.staff.id, tx, now))[0]?.count).toBe(1);
    await tx.hospital.update({ where: { id: f.hospital.id }, data: { status: "SUSPENDED" } });
    expect(await calculatePendingActions(f.staff.id, tx, now)).toEqual([]);
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(0);
    await tx.hospital.update({ where: { id: f.hospital.id }, data: { status: "ACTIVE" } });
    await tx.hospitalMembership.updateMany({ where: { userId: f.staff.id }, data: { status: "ENDED" } });
    await tx.osmHospitalRelationship.updateMany({ where: { userId: f.osm.id }, data: { status: "ENDED" } });
    expect(await calculatePendingActions(f.staff.id, tx, now)).toEqual([]);
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(0);
    await tx.user.update({ where: { id: f.osm.id }, data: { status: "SUSPENDED" } });
    await expect(calculatePendingActions(f.osm.id, tx, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }));

  it("counts only the current OSM's actionable assignments and retains the existing acceptance badge semantics", async () => isolated(async (tx) => {
    const f = await fixture(tx);
    const other = await fixture(tx);
    const indicators = await calculatePendingActions(f.osm.id, tx, now);
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toMatchObject({ count: 1, navigationHref: "/app/appointments" });
    expect(indicators[0]?.href).toContain(f.hospital.id);
    expect(JSON.stringify(indicators)).not.toContain(other.hospital.id);
    const access = await resolveActorAccessByUserId(f.osm.id, createActorContextStore(tx));
    if (access.status !== "AUTHORIZED") throw new Error("fixture actor missing");
    const deps = { database: tx, now: () => now };
    expect(await countWorkAppointmentsAwaitingMyAcceptance(access.actor, deps)).toBe(1);
    expect((await listWorkAppointments(access.actor, { hospitalId: f.hospital.id, tab: "AWAITING_MY_ACCEPTANCE" }, deps)).items).toHaveLength(1);
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(1);
    await tx.patientAppointmentAssigneeAcceptance.create({ data: {
      appointmentId: f.appointment.id, sourceAppointmentUpdatedAt: f.appointment.updatedAt, acceptedByUserId: f.osm.id, submissionNonce: randomUUID(),
    } });
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(0);
    expect(await countWorkAppointmentsAwaitingMyAcceptance(access.actor, deps)).toBe(0);
    // A new appointment version requires acceptance again, following the existing workflow contract.
    await tx.patientAppointment.update({ where: { id: f.appointment.id }, data: { updatedAt: new Date(now.getTime() + 1_000) } });
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(1);
    await tx.patientAppointmentRescheduleRequest.create({ data: {
      appointmentId: f.appointment.id, sourceAppointmentUpdatedAt: new Date(now.getTime() + 1_000), submittedByUserId: f.osm.id,
      source: "OSM_PROXY", submissionNonce: randomUUID(), preferredDatetimes: [future], reason: "ขอเลื่อน",
    } });
    expect((await calculatePendingActions(f.osm.id, tx, now))[0]?.count).toBe(0);
  }));

  it("gives ADMIN only pending onboarding and NEW support, never Hospital queues", async () => isolated(async (tx) => {
    const f = await fixture(tx);
    await tx.userRole.create({ data: { userId: f.staff.id, role: "ADMIN" } });
    const baseline = await calculatePendingActions(f.staff.id, tx, now);
    const application = await tx.hospitalOnboardingApplication.create({ data: { hospitalId: f.hospital.id, applicantUserId: f.patient.id } });
    const support = await tx.supportReport.create({ data: { reporterUserId: f.patient.id, category: "OTHER", message: "ทดสอบ" } });
    const indicators = await calculatePendingActions(f.staff.id, tx, now);
    expect(indicators.map(({ navigationHref }) => navigationHref)).toEqual(["/app/admin/hospital-onboarding", "/app/admin/support"]);
    expect(indicators.map(({ count }, index) => count - (baseline[index]?.count ?? 0))).toEqual([1, 1]);
    await tx.supportReport.update({ where: { id: support.id }, data: { status: "ACKNOWLEDGED", statusUpdaterUserId: f.staff.id } });
    expect((await calculatePendingActions(f.staff.id, tx, now))[1]?.count).toBe(baseline[1]?.count);
    await tx.hospitalOnboardingApplication.update({ where: { id: application.id }, data: { status: "REJECTED", reviewedAt: now, reviewedByUserId: f.staff.id, rejectionReason: "ข้อมูลไม่ครบ" } });
    expect((await calculatePendingActions(f.staff.id, tx, now))[0]?.count).toBe(baseline[0]?.count);
  }));
});
