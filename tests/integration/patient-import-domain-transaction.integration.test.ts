import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { patientOsmAssignmentRequestSchema } from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import { assignOsmToPatientInTransaction } from "@/modules/patient-assignment/services/patient-osm-assignment-transaction";
import { patientBaselineCreateRequestSchema } from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import { createPatientBaselineInTransaction } from "@/modules/patient-baseline/services/patient-baseline-transaction";
import { patientProvisionInputSchema } from "@/modules/patient-provisioning/schemas/patient-provisioning-schemas";
import { provisionPatientInTransaction } from "@/modules/patient-provisioning/services/patient-provisioning-transaction";

const prisma = getPrisma();
const transactionNow = new Date("2026-08-25T05:00:00.000Z");
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientBaseline.deleteMany();
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

async function createHospital(): Promise<{ id: string }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `PHASE-16D1-${sequence}`,
      name: "โรงพยาบาลทดสอบธุรกรรม Phase 16D.1",
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createOwnerActor(hospitalId: string): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d1-owner-${sequence}` },
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
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

async function createOsmUser(hospitalId: string): Promise<string> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d1-osm-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: {
      userId: user.id,
      hospitalId,
      status: MembershipStatus.ACTIVE,
    },
  });

  return user.id;
}

function provisioningInput(hospitalId: string, value: string) {
  return patientProvisionInputSchema.parse({
    identity: { namespace: "phase-16d1-transaction", value },
    givenName: "สมชาย",
    familyName: "ทดสอบธุรกรรม",
    targetHospitalId: hospitalId,
    hospitalNumber: `HN-${value}`,
  });
}

describe("Phase 16D.1 transaction-composable patient domains", () => {
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

  it("commits provisioning, Baseline, assignment, and their audits through one caller-owned transaction", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const osmUserId = await createOsmUser(hospital.id);

    const result = await runSerializableTransaction(prisma, async (transaction) => {
      const patient = await provisionPatientInTransaction(
        transaction,
        actor,
        provisioningInput(hospital.id, "commit"),
        "BULK",
      );
      const baseline = await createPatientBaselineInTransaction(
        transaction,
        actor,
        patientBaselineCreateRequestSchema.parse({
          patientHospitalRelationshipId: patient.relationshipId,
          recordedOn: "2026-08-25",
          weight: 72.5,
        }),
        transactionNow,
      );
      const assignment = await assignOsmToPatientInTransaction(
        transaction,
        actor,
        patientOsmAssignmentRequestSchema.parse({
          patientHospitalRelationshipId: patient.relationshipId,
          osmUserId,
        }),
        transactionNow,
      );

      return { patient, baseline, assignment };
    });

    expect(result.patient.outcome).toBe("CREATED");
    expect(result.baseline.patientHospitalRelationshipId).toBe(result.patient.relationshipId);
    expect(result.assignment).toMatchObject({ operation: "ASSIGNED", osmUserId });
    await expect(
      prisma.patientBaseline.count({
        where: { patientHospitalRelationshipId: result.patient.relationshipId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.patientOsmAssignment.count({
        where: { patientHospitalRelationshipId: result.patient.relationshipId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.findMany({
        where: { actorUserId: actor.userId },
        select: { action: true },
        orderBy: { action: "asc" },
      }),
    ).resolves.toEqual([
      { action: "patient.osm_assigned" },
      { action: "patient.provisioned" },
      { action: "patient_baseline.created" },
    ]);
  });

  it("rolls back all composed mutations and audits when a later operation fails", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const osmUserId = await createOsmUser(hospital.id);
    const input = provisioningInput(hospital.id, "rollback");

    await expect(
      runSerializableTransaction(prisma, async (transaction) => {
        const patient = await provisionPatientInTransaction(
          transaction,
          actor,
          input,
          "BULK",
        );
        await createPatientBaselineInTransaction(
          transaction,
          actor,
          patientBaselineCreateRequestSchema.parse({
            patientHospitalRelationshipId: patient.relationshipId,
            recordedOn: "2026-08-25",
            weight: 72.5,
          }),
          transactionNow,
        );
        await assignOsmToPatientInTransaction(
          transaction,
          actor,
          patientOsmAssignmentRequestSchema.parse({
            patientHospitalRelationshipId: patient.relationshipId,
            osmUserId,
          }),
          transactionNow,
        );

        throw new Error("forced caller-owned transaction rollback");
      }),
    ).rejects.toThrow("forced caller-owned transaction rollback");

    await expect(
      prisma.person.count({ where: { identityKeyHash: hashIdentityReference(input.identity) } }),
    ).resolves.toBe(0);
    await expect(prisma.patientProfile.count()).resolves.toBe(0);
    await expect(prisma.patientHospitalRelationship.count()).resolves.toBe(0);
    await expect(prisma.patientBaseline.count()).resolves.toBe(0);
    await expect(prisma.patientOsmAssignment.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });
});
