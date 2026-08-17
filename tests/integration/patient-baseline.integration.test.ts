import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientBaseline.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(code: string): Promise<{ id: string }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `BASELINE-${code}-${sequence}`,
      name: `โรงพยาบาล Baseline ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `baseline-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: input.hospitalId,
          membershipType,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function addAdminRole(actor: { actor: ActorContext; userId: string }): Promise<void> {
  await prisma.userRole.create({ data: { userId: actor.userId, role: Role.ADMIN } });
  actor.actor.roles = [Role.ADMIN, Role.HOSPITAL];
}

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `baseline-osm-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    },
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `baseline-admin-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.ADMIN],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

function baselineInput(relationshipId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: "2026-08-17",
    weight: 72.5,
    waistCircumference: 90,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: 95,
    adaptationSummary: "ข้อมูลปรับตัวที่ไม่ควรอยู่ใน audit",
    adaptationObstacles: "อุปสรรคต้นแบบ",
    adaptationOpportunities: "ปัจจัยสนับสนุนต้นแบบ",
    confidenceScore: 7,
    confidenceImprovementPlan: "แผนความมั่นใจต้นแบบ",
    summary: "สรุปข้อมูลตั้งต้นที่ไม่ควรอยู่ใน audit",
    recommendations: "คำแนะนำต้นแบบ",
    ...overrides,
  };
}

describe("Phase 10C.0 Patient Baseline PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates and reads one relationship-scoped Baseline without cross-domain mutations", async () => {
    const hospital = await createHospital("DIRECT");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-integration", value: "direct-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "ข้อมูลตั้งต้น",
      hospitalNumber: "HN-BASELINE-001",
    });
    const beforeCounts = {
      screenings: await prisma.screeningAssessment.count(),
      goals: await prisma.patientGoalPlan.count(),
      appointments: await prisma.patientAppointment.count(),
      followups: await prisma.patientFollowup.count(),
    };

    const created = await createPatientBaseline(owner.actor, baselineInput(patient.relationshipId));
    const read = await getPatientBaseline(owner.actor, patient.relationshipId);

    expect(created).toMatchObject({
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalId: hospital.id,
      recordedByUserId: owner.userId,
      recordedOn: new Date("2026-08-17T00:00:00.000Z"),
    });
    expect(read).toMatchObject({
      id: created.patientBaselineId,
      patientHospitalRelationshipId: patient.relationshipId,
      recorder: { id: owner.userId },
      measurements: { weight: 72.5, bloodPressureSystolic: 120, bloodSugarDtx: 95 },
      confidence: { score: 7 },
    });
    expect(await prisma.patientBaseline.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.patientFollowup.count()).toBe(beforeCounts.followups);
    expect(await prisma.screeningAssessment.count()).toBe(beforeCounts.screenings);
    expect(await prisma.patientGoalPlan.count()).toBe(beforeCounts.goals);
    expect(await prisma.patientAppointment.count()).toBe(beforeCounts.appointments);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "patient_baseline.created", resourceId: created.patientBaselineId },
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain("72.5");
    expect(JSON.stringify(audit?.metadata)).not.toContain("ข้อมูลปรับตัว");
    expect(JSON.stringify(audit?.metadata)).not.toContain("คำแนะนำต้นแบบ");
  });

  it("allows exact OSM scope, preserves a valid multi-role Hospital path, and denies other actors", async () => {
    const hospital = await createHospital("SCOPE");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const multiRole = await createHospitalActor({ hospitalId: hospital.id });
    await addAdminRole(multiRole);
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-integration", value: "scope-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ขอบเขต",
    });

    await expect(createPatientBaseline(unassignedOsm.actor, baselineInput(patient.relationshipId))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(createPatientBaseline(admin, baselineInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createPatientBaseline(otherOwner.actor, baselineInput(patient.relationshipId))).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const directBaseline = await createPatientBaseline(owner.actor, baselineInput(patient.relationshipId));
    await expect(getPatientBaseline(otherOwner.actor, patient.relationshipId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getPatientBaseline(owner.actor, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await getPatientBaseline(owner.actor, patient.relationshipId))?.id).toBe(directBaseline.patientBaselineId);

    const osmPatient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-integration", value: "osm-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมปอง",
      familyName: "อสม.",
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: osmPatient.relationshipId,
      osmUserId: osm.userId,
    });
    await createPatientBaseline(osm.actor, baselineInput(osmPatient.relationshipId));
    expect((await getPatientBaseline(osm.actor, osmPatient.relationshipId))?.recorder.id).toBe(osm.userId);

    const multiRolePatient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-integration", value: "multi-role-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมใจ",
      familyName: "หลายบทบาท",
    });
    await createPatientBaseline(multiRole.actor, baselineInput(multiRolePatient.relationshipId));
    expect(await prisma.patientBaseline.count({ where: { patientHospitalRelationshipId: multiRolePatient.relationshipId } })).toBe(1);
  });

  it("uses the unique relationship key as the final concurrent duplicate guard", async () => {
    const hospital = await createHospital("CONCURRENT");
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-integration", value: "concurrent-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "ส่งซ้ำ",
    });
    const input = baselineInput(patient.relationshipId);

    const outcomes = await Promise.allSettled([
      createPatientBaseline(owner.actor, input),
      createPatientBaseline(owner.actor, input),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof createPatientBaseline>>> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.patientBaseline.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_baseline.created" } })).toBe(1);
  });
});
