import ExcelJS from "exceljs";
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
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  getPatientClassificationCounts,
  getPatientClassificationPageContext,
} from "@/modules/patient-classification/services/patient-classification-query-service";
import { setPatientClassification } from "@/modules/patient-classification/services/patient-classification-service";
import { findPatientDirectory } from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  readPatientImportCandidates,
  type PatientImportUpload,
} from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  provisionPatient,
  type PatientProvisioningServiceDependencies,
  type ProvisionPatientInput,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const transactionNow = new Date("2026-08-27T05:00:00.000Z");

const nationalIds = {
  rosterCreate: "1000000000009",
  rosterSame: "1000000000017",
  rosterConflict: "1000000000025",
  rosterConfirmed: "1000000000033",
  rosterInvalid: "1000000000041",
  rosterAtomic: "1000000000050",
  rosterRollback: "1000000000068",
  rosterIndependentValid: "1000000000076",
  rosterIndependentConflict: "1000000000084",
  rosterStale: "1000000000092",
} as const;

let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientClassificationHistory.deleteMany();
  await prisma.patientClassification.deleteMany();
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

async function createHospital(
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<{ id: string; status: HospitalStatus }> {
  sequence += 1;

  return prisma.hospital.create({
    data: {
      hospitalCode: `PHASE-16D3-${sequence}`,
      name: `โรงพยาบาลสังเคราะห์ Phase 16D.3 ${sequence}`,
      status,
    },
    select: { id: true, status: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  userStatus?: UserStatus;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d3-actor-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      status: membershipStatus,
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
          status: membershipStatus,
          hospitalStatus: hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<ActorContext> {
  sequence += 1;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d3-osm-${sequence}` },
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
    personId: person.id,
    roles: [Role.OSM],
    hospitalMemberships: [],
    osmHospitalRelationships: [
      { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: hospital.status },
    ],
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d3-admin-${sequence}` },
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

function patientInput(nationalId: string, hospitalId: string): ProvisionPatientInput {
  return {
    identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId },
    givenName: "ผู้ป่วยสังเคราะห์",
    familyName: "ระยะที่สิบหกดีสาม",
    hospitalNumber: `HN-${nationalId.slice(-4)}`,
    targetHospitalId: hospitalId,
  };
}

function importDependencies(
  database: PrismaClient = prisma,
  now = transactionNow,
): PatientProvisioningServiceDependencies {
  return { database, now: () => now, transactionRetries: 2 };
}

async function createRosterUpload(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Synthetic roster");
  worksheet.addRow([...headers]);

  for (const row of rows) {
    worksheet.addRow([...row]);
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name: "synthetic-phase-16d3.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

async function readClassificationCandidate(
  hospitalId: string,
  nationalId: string,
  classification: string,
): Promise<Awaited<ReturnType<typeof readPatientImportCandidates>>[number]> {
  const [candidate] = await readClassificationCandidates(hospitalId, [{ nationalId, classification }]);

  if (!candidate) {
    throw new Error("Synthetic classification candidate was not created");
  }

  return candidate;
}

async function readClassificationCandidates(
  hospitalId: string,
  rows: readonly { nationalId: string; classification: string }[],
): Promise<Awaited<ReturnType<typeof readPatientImportCandidates>>> {
  const upload = await createRosterUpload(
    ["Thai National ID", "First name", "Last name", "HN", "ประเภทเบาหวาน"],
    rows.map(({ nationalId, classification }) => [
      nationalId,
      "ผู้ป่วยสังเคราะห์",
      "ระยะที่สิบหกดีสาม",
      `HN-${nationalId.slice(-4)}`,
      classification,
    ]),
  );

  return readPatientImportCandidates(upload, hospitalId);
}

async function readCandidateClassification(
  candidate: Awaited<ReturnType<typeof readPatientImportCandidates>>[number],
) {
  if (!candidate.input) {
    throw new Error("Synthetic classification candidate is invalid");
  }

  const person = await prisma.person.findUniqueOrThrow({
    where: { identityKeyHash: hashIdentityReference(candidate.input.identity) },
    select: { patientProfile: { select: { id: true } } },
  });

  if (!person.patientProfile) {
    throw new Error("Synthetic classification candidate has no PatientProfile");
  }

  return prisma.patientClassification.findUniqueOrThrow({
    where: { patientProfileId: person.patientProfile.id },
    select: { classification: true },
  });
}

function createClassificationFailureDatabase(): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return (
        operation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        target.$transaction(async (transaction) => {
          const failingClassification = new Proxy(transaction.patientClassification, {
            get(delegate, delegateProperty, delegateReceiver): unknown {
              if (delegateProperty === "create" || delegateProperty === "update") {
                return async (): Promise<never> => {
                  throw new Error("forced classification write failure");
                };
              }

              return Reflect.get(delegate, delegateProperty, delegateReceiver);
            },
          });
          const transactionWithFailure = new Proxy(transaction, {
            get(transactionTarget, transactionProperty, transactionReceiver): unknown {
              if (transactionProperty === "patientClassification") {
                return failingClassification;
              }

              return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            },
          });

          return operation(transactionWithFailure as unknown as Prisma.TransactionClient);
        });
    },
  }) as unknown as PrismaClient;
}

describe("Phase 16D.3 Patient classification PostgreSQL workflow", () => {
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

  it("supports OWNER and MEMBER changes as one patient-global history", async () => {
    const hospitalA = await createHospital();
    const hospitalB = await createHospital();
    const owner = await createHospitalActor({
      hospitalId: hospitalA.id,
      membershipType: MembershipType.OWNER,
    });
    const member = await createHospitalActor({
      hospitalId: hospitalB.id,
      membershipType: MembershipType.MEMBER,
    });
    const input = patientInput("1000000000106", hospitalA.id);
    const patientInA = await provisionPatient(owner.actor, input, importDependencies());
    const patientInB = await provisionPatient(
      member.actor,
      { ...input, targetHospitalId: hospitalB.id },
      importDependencies(),
    );

    const first = await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: patientInA.relationshipId, classification: "RISK" },
      importDependencies(prisma, new Date("2026-08-27T05:00:00.000Z")),
    );
    const second = await setPatientClassification(
      member.actor,
      { patientHospitalRelationshipId: patientInB.relationshipId, classification: "DIABETES" },
      importDependencies(prisma, new Date("2026-08-27T05:01:00.000Z")),
    );
    const third = await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: patientInA.relationshipId, classification: "RISK" },
      importDependencies(prisma, new Date("2026-08-27T05:02:00.000Z")),
    );

    expect(first).toMatchObject({ operation: "CREATED", previousClassification: null });
    expect(second).toMatchObject({ operation: "CHANGED", previousClassification: "RISK" });
    expect(third).toMatchObject({ operation: "CHANGED", previousClassification: "DIABETES" });
    expect(await prisma.patientClassification.count()).toBe(1);
    expect(await prisma.patientClassificationHistory.count()).toBe(3);

    const current = await prisma.patientClassification.findUniqueOrThrow({
      where: { patientProfileId: patientInA.patientProfileId },
      select: { classification: true, updatedByUserId: true },
    });
    expect(current).toEqual({ classification: "RISK", updatedByUserId: owner.userId });

    const memberView = await getPatientClassificationPageContext(
      member.actor,
      patientInB.relationshipId,
    );
    expect(memberView).toMatchObject({
      patient: {
        patientHospitalRelationshipId: patientInB.relationshipId,
      },
      current: { classification: "RISK", updatedByDisplayName: "ผู้ใช้งาน" },
      canManage: true,
    });
    expect(memberView.history).toHaveLength(3);

    const history = await prisma.patientClassificationHistory.findMany({
      where: { patientProfileId: patientInA.patientProfileId },
      orderBy: { changedAt: "asc" },
      select: {
        fromClassification: true,
        toClassification: true,
        changedAt: true,
        changedByUserId: true,
        source: true,
      },
    });
    expect(history).toEqual([
      {
        fromClassification: null,
        toClassification: "RISK",
        changedAt: new Date("2026-08-27T05:00:00.000Z"),
        changedByUserId: owner.userId,
        source: "MANUAL",
      },
      {
        fromClassification: "RISK",
        toClassification: "DIABETES",
        changedAt: new Date("2026-08-27T05:01:00.000Z"),
        changedByUserId: member.userId,
        source: "MANUAL",
      },
      {
        fromClassification: "DIABETES",
        toClassification: "RISK",
        changedAt: new Date("2026-08-27T05:02:00.000Z"),
        changedByUserId: owner.userId,
        source: "MANUAL",
      },
    ]);
    expect(await prisma.auditEvent.count({ where: { action: "patient_classification.created" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_classification.changed" } })).toBe(2);
    const classificationAudits = await prisma.auditEvent.findMany({
      where: {
        action: {
          in: ["patient_classification.created", "patient_classification.changed"],
        },
      },
      select: { metadata: true },
    });
    expect(JSON.stringify(classificationAudits)).not.toContain("1000000000106");
    expect(JSON.stringify(classificationAudits)).not.toContain("สมชาย ผู้ป่วย");
  });

  it("denies OSM, ADMIN, inactive membership, inactive Hospital, and unrelated Hospital access", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await provisionPatient(
      owner.actor,
      patientInput("1000000000114", hospital.id),
      importDependencies(),
    );
    const osm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const unrelated = await createHospitalActor({ hospitalId: otherHospital.id });
    const inactiveMember = await createHospitalActor({
      hospitalId: hospital.id,
      membershipStatus: MembershipStatus.SUSPENDED,
    });

    for (const actor of [osm, admin, unrelated.actor, inactiveMember.actor]) {
      await expect(
        setPatientClassification(
          actor,
          { patientHospitalRelationshipId: patient.relationshipId, classification: "RISK" },
          importDependencies(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }

    const suspendedHospital = await createHospital();
    const suspendedOwner = await createHospitalActor({
      hospitalId: suspendedHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const suspendedPatient = await provisionPatient(
      suspendedOwner.actor,
      patientInput("1000000000122", suspendedHospital.id),
      importDependencies(),
    );
    await prisma.hospital.update({
      where: { id: suspendedHospital.id },
      data: { status: HospitalStatus.SUSPENDED },
    });
    await expect(
      setPatientClassification(
        suspendedOwner.actor,
        { patientHospitalRelationshipId: suspendedPatient.relationshipId, classification: "RISK" },
        importDependencies(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps same-target concurrent mutations idempotent", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await provisionPatient(
      owner.actor,
      patientInput("1000000000130", hospital.id),
      importDependencies(),
    );

    const outcomes = await Promise.all([
      setPatientClassification(
        owner.actor,
        { patientHospitalRelationshipId: patient.relationshipId, classification: "RISK" },
        importDependencies(),
      ),
      setPatientClassification(
        owner.actor,
        { patientHospitalRelationshipId: patient.relationshipId, classification: "RISK" },
        importDependencies(),
      ),
    ]);

    expect(outcomes.map(({ operation }) => operation).sort()).toEqual(["CREATED", "NOOP"]);
    expect(await prisma.patientClassification.count()).toBe(1);
    expect(await prisma.patientClassificationHistory.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_classification.created" } })).toBe(1);
  });

  it("creates, no-ops, previews, and explicitly confirms roster classification reconciliation", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const createCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterCreate,
      " กลุ่มเสี่ยง ",
    );
    const createPreview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [createCandidate],
      prisma,
    );
    const createSummary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [createCandidate],
      importDependencies(),
    );

    expect(createPreview.rows[0]).toMatchObject({
      classification: "READY",
      patientClassification: {
        status: "CLASSIFICATION_READY",
        currentClassification: null,
        sourceClassification: "RISK",
      },
    });
    expect(createSummary).toMatchObject({ imported: 1, classificationCreated: 1 });
    expect(await prisma.patientClassificationHistory.count()).toBe(1);

    const sameCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterCreate,
      "เบาหวาน",
    );
    const samePreview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [sameCandidate],
      prisma,
    );
    expect(samePreview.rows[0]?.patientClassification.status).toBe(
      "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
    );

    const sourceRiskCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterSame,
      "กลุ่มเสี่ยง",
    );
    const sourceRiskSummary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [sourceRiskCandidate],
      importDependencies(),
    );
    expect(sourceRiskSummary).toMatchObject({ imported: 1, classificationCreated: 1 });
    const sameValueSummary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [sourceRiskCandidate],
      importDependencies(),
    );
    expect(sameValueSummary).toMatchObject({
      alreadyExists: 1,
      classificationCreated: 0,
      classificationAlreadyExists: 1,
      classificationChanged: 0,
    });

    const conflictCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterConflict,
      "กลุ่มเสี่ยง",
    );
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [conflictCandidate],
      importDependencies(),
    );
    const conflictingCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterConflict,
      "เบาหวาน",
    );
    const conflictPreview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [conflictingCandidate],
      prisma,
    );
    expect(conflictPreview).toMatchObject({
      classificationReconciliations: [{
        rowNumber: 2,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      }],
    });
    expect(conflictPreview.rows[0]).toMatchObject({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
    });

    const unconfirmed = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [conflictingCandidate],
      importDependencies(),
    );
    expect(unconfirmed).toMatchObject({ needsReview: 1, classificationNeedsReview: 1 });
    expect(await prisma.patientClassificationHistory.count()).toBe(3);

    const confirmed = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [conflictingCandidate],
      importDependencies(),
      {
        classificationReconciliationChoices: [{
          rowNumber: 2,
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        }],
      },
    );
    expect(confirmed).toMatchObject({ alreadyExists: 1, classificationChanged: 1 });
    expect(await prisma.patientClassificationHistory.count()).toBe(4);
    await expect(readCandidateClassification(conflictingCandidate)).resolves.toEqual({
      classification: "DIABETES",
    });
  });

  it("rejects an invalid source classification without persisting the Patient", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const candidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterInvalid,
      "เบาหวาน type 2",
    );

    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
    );

    expect(preview.rows[0]).toMatchObject({
      classification: "INVALID",
      patientClassification: { status: "CLASSIFICATION_DATA_INVALID" },
    });
    expect(summary).toMatchObject({ invalid: 1, classificationInvalid: 1, imported: 0 });
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientClassification.count()).toBe(0);
  });

  it("commits Baseline and classification atomically with the new Patient core", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const candidate = await createRosterUpload(
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "ประเภทเบาหวาน"],
      [[nationalIds.rosterAtomic, "ผู้ป่วยสังเคราะห์", "อะตอมมิก", "HN-0050", 72.5, "เบาหวาน"]],
    ).then(async (upload) => (await readPatientImportCandidates(upload, hospital.id))[0]);

    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: "2026-08-01" },
    );

    expect(summary).toMatchObject({
      imported: 1,
      baselineCreated: 1,
      classificationCreated: 1,
    });
    expect(await prisma.patientProfile.count()).toBe(1);
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(await prisma.patientClassification.count()).toBe(1);
    expect(await prisma.patientClassificationHistory.count()).toBe(1);
  });

  it("rolls back newly created core and Baseline when classification persistence fails", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const candidate = await createRosterUpload(
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "ประเภทเบาหวาน"],
      [[nationalIds.rosterRollback, "ผู้ป่วยสังเคราะห์", "ย้อนกลับ", "HN-0068", 70, "กลุ่มเสี่ยง"]],
    ).then(async (upload) => (await readPatientImportCandidates(upload, hospital.id))[0]);

    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(createClassificationFailureDatabase()),
      { effectiveDate: "2026-08-01" },
    );

    expect(summary).toMatchObject({ imported: 0, failed: 1 });
    expect(
      await prisma.person.count({
        where: {
          identityKeyHash: hashIdentityReference({
            namespace: "phase-16d3-patient",
            value: nationalIds.rosterRollback,
          }),
        },
      }),
    ).toBe(0);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.patientBaseline.count()).toBe(0);
    expect(await prisma.patientClassification.count()).toBe(0);
    expect(await prisma.patientClassificationHistory.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("keeps independent valid roster rows independent from one unconfirmed conflict", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const conflictingCandidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterIndependentConflict,
      "กลุ่มเสี่ยง",
    );
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [conflictingCandidate],
      importDependencies(),
    );
    const [validCandidate, changedCandidate] = await readClassificationCandidates(hospital.id, [
      { nationalId: nationalIds.rosterIndependentValid, classification: "เบาหวาน" },
      { nationalId: nationalIds.rosterIndependentConflict, classification: "เบาหวาน" },
    ]);

    if (!validCandidate || !changedCandidate) {
      throw new Error("Synthetic independent classification candidates were not created");
    }

    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [validCandidate, changedCandidate],
      importDependencies(),
    );

    expect(summary).toMatchObject({
      imported: 1,
      needsReview: 1,
      classificationCreated: 1,
      classificationNeedsReview: 1,
    });
    expect(summary.rows.map(({ result }) => result)).toEqual(["IMPORTED", "NEEDS_REVIEW"]);
    expect(await prisma.patientClassification.count()).toBe(2);
  });

  it("re-evaluates current state at confirmation and makes a stale same-target choice a NOOP", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const patient = await provisionPatient(
      owner.actor,
      patientInput(nationalIds.rosterStale, hospital.id),
      importDependencies(),
    );
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: patient.relationshipId, classification: "RISK" },
      importDependencies(prisma, new Date("2026-08-27T05:00:00.000Z")),
    );
    const candidate = await readClassificationCandidate(
      hospital.id,
      nationalIds.rosterStale,
      "เบาหวาน",
    );
    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);

    expect(preview.classificationReconciliations).toHaveLength(1);
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: patient.relationshipId, classification: "DIABETES" },
      importDependencies(prisma, new Date("2026-08-27T05:01:00.000Z")),
    );

    const result = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      {
        classificationReconciliationChoices: [{
          rowNumber: 2,
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        }],
      },
    );

    expect(result).toMatchObject({ classificationAlreadyExists: 1, classificationChanged: 0 });
    expect(await prisma.patientClassificationHistory.count()).toBe(2);
  });

  it("filters and counts current classification without history inflation or cross-Hospital leakage", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id });
    const riskPatient = await provisionPatient(
      owner.actor,
      patientInput("1000000000155", hospital.id),
      importDependencies(),
    );
    const diabetesPatient = await provisionPatient(
      owner.actor,
      patientInput("1000000000163", hospital.id),
      importDependencies(),
    );
    await provisionPatient(
      owner.actor,
      patientInput("1000000000171", hospital.id),
      importDependencies(),
    );
    await provisionPatient(
      otherOwner.actor,
      patientInput("1000000000189", otherHospital.id),
      importDependencies(),
    );
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: riskPatient.relationshipId, classification: "RISK" },
      importDependencies(),
    );
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: diabetesPatient.relationshipId, classification: "DIABETES" },
      importDependencies(),
    );
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: riskPatient.relationshipId, classification: "DIABETES" },
      importDependencies(),
    );
    await setPatientClassification(
      owner.actor,
      { patientHospitalRelationshipId: riskPatient.relationshipId, classification: "RISK" },
      importDependencies(),
    );

    await expect(getPatientClassificationCounts(owner.actor, hospital.id)).resolves.toEqual({
      total: 3,
      risk: 1,
      diabetes: 1,
      unclassified: 1,
    });
    const riskPage = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "RISK",
    });
    const diabetesPage = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "DIABETES",
    });
    const allPage = await findPatientDirectory(owner.actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "",
      page: "1",
      classification: "ALL",
    });

    expect(riskPage.total).toBe(1);
    expect(diabetesPage.total).toBe(1);
    expect(allPage.total).toBe(3);
    expect(allPage.items).toHaveLength(3);
    expect(allPage.items.map(({ classification }) => classification).sort()).toEqual([
      "DIABETES",
      "RISK",
      null,
    ]);
  });
});
