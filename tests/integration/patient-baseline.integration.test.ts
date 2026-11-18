import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import {
  getPatientBaseline,
  getPatientBaselinePageContext,
} from "@/modules/patient-baseline/services/patient-baseline-query-service";
import {
  createPatientBaseline,
  updatePatientBaseline,
} from "@/modules/patient-baseline/services/patient-baseline-service";
import { PATIENT_BASELINE_LOCKED_MESSAGE } from "@/modules/patient-baseline/domain/patient-baseline-edit-lock";
import { endPatientHospitalRelationship } from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import { completePatientProgram, openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { clearProgramRoundCompletions } from "./support/program-rounds";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await clearProgramRoundCompletions();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  // Adjusted Goal Plans reference Follow-ups that may reference Goal Plans; clear the link first.
  await prisma.patientGoalPlan.updateMany({ where: { sourceFollowupId: { not: null } }, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointmentAssigneeAcceptance.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalHealthHistory.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.hospitalServiceArea.deleteMany(),
  ]);
  await prisma.hospitalServiceAreaEligibility.deleteMany();
  await prisma.user.deleteMany();
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
  const membershipType = input.membershipType ?? MembershipType.OWNER;
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

type ProvisionedPatient = Awaited<ReturnType<typeof provisionPatient>>;

/** A Baseline row's current version, as the edit form posts it. */
async function versionOf(relationshipId: string): Promise<string> {
  const baseline = await prisma.patientBaseline.findUniqueOrThrow({
    where: { patientHospitalRelationshipId: relationshipId },
    select: { updatedAt: true },
  });
  return baseline.updatedAt.toISOString();
}

function editInput(
  relationshipId: string,
  expectedUpdatedAt: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return { patientHospitalRelationshipId: relationshipId, recordedOn: "2026-08-17", expectedUpdatedAt, ...values };
}

/**
 * Pauses each Serializable transaction right after `pauseAfter` returns true for a read, until both
 * transactions have reached that point. Both have then read what the other is about to write.
 */
function rendezvousDatabase(
  pauseAfter: (model: string, operation: string) => boolean,
  arrive: () => Promise<void>,
): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return (
        operation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
      ) =>
        target.$transaction(async (transaction) => {
          let paused = false;
          const pausing = new Proxy(transaction, {
            get(transactionTarget, model, transactionReceiver): unknown {
              const delegate: unknown = Reflect.get(transactionTarget, model, transactionReceiver);

              if (typeof model !== "string" || typeof delegate !== "object" || delegate === null) {
                return delegate;
              }

              return new Proxy(delegate, {
                get(delegateTarget, method, delegateReceiver): unknown {
                  const original: unknown = Reflect.get(delegateTarget, method, delegateReceiver);

                  if (typeof method !== "string" || typeof original !== "function" || !pauseAfter(model, method)) {
                    return original;
                  }

                  return async (...args: unknown[]): Promise<unknown> => {
                    const result: unknown = await Reflect.apply(original, delegateTarget, args);

                    if (!paused) {
                      paused = true;
                      await arrive();
                    }

                    return result;
                  };
                },
              });
            },
          });

          return operation(pausing as Prisma.TransactionClient);
        }, { ...options, timeout: 20_000 });
    },
  }) as PrismaClient;
}

/** A two-party barrier that never blocks longer than `timeoutMs`, so one failing side cannot hang the other. */
function twoPartyBarrier(timeoutMs = 10_000): () => Promise<void> {
  let arrivals = 0;
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, timeoutMs);
  });

  return async () => {
    arrivals += 1;
    if (arrivals === 2) {
      release();
    }
    await opened;
  };
}

describe("Baseline editing until a Program links it (owner decision 2026-11-17)", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  async function setup(code: string): Promise<{
    hospitalId: string;
    owner: Awaited<ReturnType<typeof createHospitalActor>>;
    patient: ProvisionedPatient;
  }> {
    const hospital = await createHospital(code);
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "baseline-edit", value: `${code}-patient` },
      targetHospitalId: hospital.id,
      givenName: "สมศรี",
      familyName: "แก้ไขได้",
    });

    return { hospitalId: hospital.id, owner, patient };
  }

  it("adds, changes and clears values, keeps the recorder and audits only field names", async () => {
    const { hospitalId, owner, patient } = await setup("EDIT");
    const other = await createHospitalActor({ hospitalId, membershipType: MembershipType.MEMBER });
    const created = await createPatientBaseline(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      recordedOn: "2026-08-17",
      weight: 72.5,
      hba1c: 6.8,
      summary: "สรุปเดิมที่ไม่ควรอยู่ใน audit",
    });

    const result = await updatePatientBaseline(other.actor, editInput(
      patient.relationshipId,
      await versionOf(patient.relationshipId),
      {
        recordedOn: "2026-08-20",
        weight: 71,
        bloodPressureSystolic: 132,
        bloodPressureDiastolic: 84,
        cvdRiskScore: 12.5,
        adaptationSummary: "ข้อความการปรับตัวที่ไม่ควรอยู่ใน audit",
      },
    ));

    expect(result).toMatchObject({
      outcome: "UPDATED",
      patientBaselineId: created.patientBaselineId,
      changedFields: [
        "recordedOn", "weight", "bloodPressureSystolic", "bloodPressureDiastolic", "hba1c", "cvdRiskScore",
        "adaptationSummary", "summary",
      ],
    });
    expect(await getPatientBaseline(owner.actor, patient.relationshipId)).toMatchObject({
      recordedOn: new Date("2026-08-20T00:00:00.000Z"),
      recorder: { id: owner.userId },
      measurements: { weight: 71, hba1c: null, bloodPressureSystolic: 132, bloodPressureDiastolic: 84, cvdRiskScore: 12.5 },
      adaptation: { summary: "ข้อความการปรับตัวที่ไม่ควรอยู่ใน audit" },
      summary: null,
    });

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "patient_baseline.updated", resourceId: created.patientBaselineId },
      select: { actorUserId: true, metadata: true },
    });
    // Compare the full payload so clinical values are rejected even when an allowed UUID shares their digits.
    expect(audit).toEqual({
      actorUserId: other.userId,
      metadata: {
        patientBaselineId: created.patientBaselineId,
        patientHospitalRelationshipId: patient.relationshipId,
        hospitalId: created.hospitalId,
        changedFields: "recordedOn,weight,bloodPressureSystolic,bloodPressureDiastolic,hba1c,cvdRiskScore,adaptationSummary,summary",
      },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("ไม่ควรอยู่ใน audit");

    const context = await getPatientBaselinePageContext(owner.actor, patient.relationshipId);
    expect(context).toMatchObject({ canCreate: false, canEdit: true, lockedByProgram: false });
  });

  it("treats a stale version as a conflict and writes nothing", async () => {
    const { owner, patient } = await setup("STALE");
    await createPatientBaseline(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, recordedOn: "2026-08-17", weight: 70 });
    const loadedVersion = await versionOf(patient.relationshipId);
    await updatePatientBaseline(owner.actor, editInput(patient.relationshipId, loadedVersion, { weight: 71 }));

    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, loadedVersion, { weight: 72 })))
      .rejects.toBeInstanceOf(ConflictError);
    expect((await getPatientBaseline(owner.actor, patient.relationshipId))?.measurements.weight).toBe(71);
    // A resend of a save that already applied changes nothing and is not an error.
    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, loadedVersion, { weight: 71 })))
      .resolves.toMatchObject({ outcome: "UNCHANGED", changedFields: [] });
    expect(await prisma.auditEvent.count({ where: { action: "patient_baseline.updated" } })).toBe(1);
  });

  it("refuses an edit once a Program has opened, and after it completes", async () => {
    const { owner, patient } = await setup("LOCKED");
    await createPatientBaseline(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, recordedOn: "2026-08-17", weight: 70 });
    const version = await versionOf(patient.relationshipId);
    const program = await openPatientProgram(owner.actor, { patientHospitalRelationshipId: patient.relationshipId });

    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, version, { weight: 71 })))
      .rejects.toMatchObject({ code: "CONFLICT", message: PATIENT_BASELINE_LOCKED_MESSAGE });
    await completePatientProgram(owner.actor, { patientProgramId: program.patientProgramId });
    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, version, { weight: 71 })))
      .rejects.toMatchObject({ code: "CONFLICT", message: PATIENT_BASELINE_LOCKED_MESSAGE });
    expect((await getPatientBaseline(owner.actor, patient.relationshipId))?.measurements.weight).toBe(70);
    expect(await getPatientBaselinePageContext(owner.actor, patient.relationshipId))
      .toMatchObject({ canEdit: false, lockedByProgram: true });
  });

  it("locks a Baseline created after a Program opened as soon as it is linked", async () => {
    const { owner, patient } = await setup("LATE");
    await openPatientProgram(owner.actor, { patientHospitalRelationshipId: patient.relationshipId });
    await createPatientBaseline(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, recordedOn: "2026-08-17", weight: 70 });

    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, await versionOf(patient.relationshipId), { weight: 71 })))
      .rejects.toMatchObject({ code: "CONFLICT", message: PATIENT_BASELINE_LOCKED_MESSAGE });
  });

  it("refuses an edit on an ended care relationship, a missing Baseline and an actor without create access", async () => {
    const { owner, patient } = await setup("ENDED");
    const admin = await createAdminActor();
    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, new Date().toISOString(), { weight: 71 })))
      .rejects.toBeInstanceOf(NotFoundError);
    await createPatientBaseline(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, recordedOn: "2026-08-17", weight: 70 });
    const version = await versionOf(patient.relationshipId);
    await expect(updatePatientBaseline(admin, editInput(patient.relationshipId, version, { weight: 71 })))
      .rejects.toBeInstanceOf(ForbiddenError);

    await endPatientHospitalRelationship(owner.actor, {
      relationshipId: patient.relationshipId,
      endReason: "ย้ายไปรับการดูแลที่อื่น",
      confirmRetention: true,
    });
    await expect(updatePatientBaseline(owner.actor, editInput(patient.relationshipId, version, { weight: 71 })))
      .rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.patientBaseline.findUniqueOrThrow({ where: { patientHospitalRelationshipId: patient.relationshipId } })).weight).toBe(70);
  });

  it("lets exactly one of a concurrent Program opening and Baseline edit commit", async () => {
    const { owner, patient } = await setup("RACE");
    await createPatientBaseline(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, recordedOn: "2026-08-17", weight: 70 });
    const version = await versionOf(patient.relationshipId);
    // Both sides read the Baseline, then wait for each other: each has taken its snapshot before
    // either writes, so the opening cannot see the edit and the edit cannot see the Program link.
    // Without retries, Serializable must abort one of them.
    const database = rendezvousDatabase(
      (model, operation) => model === "patientBaseline" && operation === "findUnique",
      twoPartyBarrier(),
    );
    const outcomes = await Promise.allSettled([
      openPatientProgram(owner.actor, { patientHospitalRelationshipId: patient.relationshipId }, { database, transactionRetries: 0 }),
      updatePatientBaseline(owner.actor, editInput(patient.relationshipId, version, { weight: 71 }), { database, transactionRetries: 0 }),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConflictError);

    const [programs, baseline] = await Promise.all([
      prisma.patientProgram.findMany({ where: { patientHospitalRelationshipId: patient.relationshipId }, select: { initialBaselineId: true } }),
      prisma.patientBaseline.findUniqueOrThrow({ where: { patientHospitalRelationshipId: patient.relationshipId }, select: { id: true, weight: true } }),
    ]);
    // Either the Program opened on the unedited Baseline, or the edit applied and no Program opened.
    expect([[1, 70], [0, 71]]).toContainEqual([programs.length, baseline.weight]);
    expect(programs.every(({ initialBaselineId }) => initialBaselineId === baseline.id)).toBe(true);
  });
});
