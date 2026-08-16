import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  getScreeningDetail,
  getScreeningHistory,
} from "@/modules/screening/services/screening-query-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { ForbiddenError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
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
  return prisma.hospital.create({
    data: { hospitalCode: code, name: `โรงพยาบาล ${code}`, status: HospitalStatus.ACTIVE },
    select: { id: true },
  });
}

async function createHospitalActor(
  hospitalId: string,
  membershipType: MembershipType = MembershipType.OWNER,
): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `screening-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId,
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
          hospitalId,
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

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `screening-osm-${sequence}` },
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

function screeningInput(relationshipId: string, submissionNonce = randomUUID()) {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce,
    responses: {
      pam: {
        "pam-1": 2,
        "pam-2": 2,
        "pam-3": 2,
        "pam-4": 2,
        "pam-5": 2,
      },
      proms: {
        "proms-1": 3,
        "proms-2": 3,
        "proms-3": 3,
        "proms-4": 3,
      },
      confidenceScore: 7,
      confidenceImprovementPlan: null,
    },
  };
}

describe("Phase 7B.0 Screening PostgreSQL workflow", () => {
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

  it("persists a server-scored assessment, keeps history, and deduplicates only the same retry", async () => {
    const hospital = await createHospital("SCREENING-E2E");
    const owner = await createHospitalActor(hospital.id);
    const osm = await createOsmActor(hospital.id);
    const otherHospital = await createHospital("SCREENING-OTHER");
    const otherOwner = await createHospitalActor(otherHospital.id);
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "screening-integration", value: "patient-1" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "Screening",
      hospitalNumber: "HN-SCREENING",
    });
    const input = screeningInput(patient.relationshipId);

    const first = await submitScreening(owner.actor, input);
    const retry = await submitScreening(owner.actor, input);

    expect(retry.screeningAssessmentId).toBe(first.screeningAssessmentId);
    expect(await prisma.screeningAssessment.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "screening.submitted" } })).toBe(1);

    await expect(submitScreening(otherOwner.actor, screeningInput(patient.relationshipId))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(submitScreening(osm.actor, screeningInput(patient.relationshipId))).rejects.toBeInstanceOf(ForbiddenError);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const osmSubmission = await submitScreening(osm.actor, screeningInput(patient.relationshipId));
    const deliberateSecond = await submitScreening(owner.actor, screeningInput(patient.relationshipId));

    expect(osmSubmission.result).toMatchObject({ level: "L3", zone: "YELLOW", percentage: 50 });
    expect(deliberateSecond.screeningAssessmentId).not.toBe(first.screeningAssessmentId);

    const history = await getScreeningHistory(owner.actor, patient.relationshipId);
    expect(history.items).toHaveLength(3);
    expect(history.items.every((item) => item.status === "SUBMITTED")).toBe(true);

    const detail = await getScreeningDetail(owner.actor, patient.relationshipId, first.screeningAssessmentId);
    expect(detail.responses.confidenceImprovementPlan).toBeNull();
    expect(detail.result).toMatchObject({ pamTotal: 10, promsTotal: 12, level: "L3", zone: "YELLOW" });
    expect(detail.questionSetVersion).toBe("legacy-prototype-v1");
    expect(detail.scoringVersion).toBe("legacy-prototype-v1");
    expect(JSON.stringify(detail)).not.toContain("nationalId");
  });
});
