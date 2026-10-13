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
  importPatientProvisioning,
  previewPatientProvisioning,
  provisionPatient,
  type PatientProvisioningServiceDependencies,
  type ProvisionPatientInput,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { readTemplateCandidates, type ImportTestHospital } from "./support/patient-import-template-upload";

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
): Promise<ImportTestHospital & { status: HospitalStatus }> {
  sequence += 1;

  return prisma.hospital.create({
    data: {
      hospitalCode: `PHASE-16D3-${sequence}`,
      name: `โรงพยาบาลสังเคราะห์ Phase 16D.3 ${sequence}`,
      status,
    },
    select: { id: true, hospitalCode: true, name: true, status: true },
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

async function readCanonicalClassificationCandidates(
  hospital: ImportTestHospital,
  rows: readonly {
    rowNumber: number;
    nationalId: string;
    classification: string;
  }[],
): Promise<Awaited<ReturnType<typeof readTemplateCandidates>>> {
  return readTemplateCandidates(
    hospital,
    rows.map((row) => ({
      nationalId: row.nationalId,
      givenName: "ผู้ป่วยสังเคราะห์",
      familyName: "แถวพิกัด",
      hospitalNumber: `HN-${row.nationalId.slice(-4)}`,
      diabetesClassification: row.classification,
    })),
    { rowNumbers: rows.map(({ rowNumber }) => rowNumber) },
  );
}

async function readClassificationCandidate(
  hospital: ImportTestHospital,
  nationalId: string,
  classification: string,
): Promise<Awaited<ReturnType<typeof readTemplateCandidates>>[number]> {
  const [candidate] = await readClassificationCandidates(hospital, [{ nationalId, classification }]);

  if (!candidate) {
    throw new Error("Synthetic classification candidate was not created");
  }

  return candidate;
}

async function readClassificationCandidates(
  hospital: ImportTestHospital,
  rows: readonly { nationalId: string; classification: string }[],
): Promise<Awaited<ReturnType<typeof readTemplateCandidates>>> {
  return readTemplateCandidates(
    hospital,
    rows.map(({ nationalId, classification }) => ({
      nationalId,
      givenName: "ผู้ป่วยสังเคราะห์",
      familyName: "ระยะที่สิบหกดีสาม",
      hospitalNumber: `HN-${nationalId.slice(-4)}`,
      diabetesClassification: classification,
    })),
  );
}

async function readCandidateClassification(
  candidate: Awaited<ReturnType<typeof readTemplateCandidates>>[number],
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

  it("records classification for new patients only and never changes an existing patient's classification", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const createCandidate = await readClassificationCandidate(
      hospital,
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
        sourceClassification: "RISK",
      },
    });
    expect(createSummary).toMatchObject({ imported: 1, classificationCreated: 1 });
    expect(await prisma.patientClassificationHistory.count()).toBe(1);

    // Same value in the file: nothing to do for an existing patient.
    const sameValueSummary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [createCandidate],
      importDependencies(),
    );
    expect(sameValueSummary).toMatchObject({ alreadyExists: 1, classificationCreated: 0 });

    // A different value in the file is ignored: no review, no confirmation, no change.
    const changedCandidate = await readClassificationCandidate(
      hospital,
      nationalIds.rosterCreate,
      "เบาหวาน",
    );
    const changedPreview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      prisma,
    );
    const changedSummary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      importDependencies(),
    );

    expect(changedPreview.rows[0]).toMatchObject({
      classification: "ALREADY_EXISTS",
      patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
    });
    expect(changedSummary).toMatchObject({ alreadyExists: 1, classificationCreated: 0 });
    expect(await prisma.patientClassificationHistory.count()).toBe(1);
    await expect(readCandidateClassification(createCandidate)).resolves.toEqual({
      classification: "RISK",
    });
  });

  it("ignores changed classifications at canonical source rows 501 and 502", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const rows = [
      { rowNumber: 501, nationalId: nationalIds.rosterConfirmed, classification: "กลุ่มเสี่ยง" },
      { rowNumber: 502, nationalId: nationalIds.rosterStale, classification: "กลุ่มเสี่ยง" },
    ] as const;
    const initialCandidates = await readCanonicalClassificationCandidates(hospital, rows);

    expect(initialCandidates.map(({ rowNumber }) => rowNumber)).toEqual([501, 502]);
    await expect(
      importPatientProvisioning(
        owner.actor,
        hospital.id,
        initialCandidates,
        importDependencies(),
      ),
    ).resolves.toMatchObject({ imported: 2, classificationCreated: 2 });

    const changedCandidates = await readCanonicalClassificationCandidates(
      hospital,
      rows.map((row) => ({ ...row, classification: "เบาหวาน" })),
    );
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      changedCandidates,
      importDependencies(),
    );

    expect(summary).toMatchObject({ alreadyExists: 2, classificationCreated: 0 });
    expect(await prisma.patientClassificationHistory.count()).toBe(2);
    expect(
      await prisma.patientClassification.count({ where: { classification: "RISK" } }),
    ).toBe(2);
  });

  it("rejects an invalid source classification without persisting the Patient", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const candidate = await readClassificationCandidate(
      hospital,
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
    expect(summary).toMatchObject({ invalid: 1, imported: 0 });
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientClassification.count()).toBe(0);
  });

  it("commits Baseline and classification atomically with the new Patient core", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const [candidate] = await readTemplateCandidates(hospital, [
      {
        nationalId: nationalIds.rosterAtomic,
        givenName: "ผู้ป่วยสังเคราะห์",
        familyName: "อะตอมมิก",
        hospitalNumber: "HN-0050",
        weight: 72.5,
        diabetesClassification: "เบาหวาน",
      },
    ]);

    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      candidate ? [candidate] : [],
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
    const [candidate] = await readTemplateCandidates(hospital, [
      {
        nationalId: nationalIds.rosterRollback,
        givenName: "ผู้ป่วยสังเคราะห์",
        familyName: "ย้อนกลับ",
        hospitalNumber: "HN-0068",
        weight: 70,
        diabetesClassification: "กลุ่มเสี่ยง",
      },
    ]);

    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      candidate ? [candidate] : [],
      importDependencies(createClassificationFailureDatabase()),
      { effectiveDate: "2026-08-01" },
    );

    expect(summary).toMatchObject({ imported: 0, failed: 1 });
    expect(
      await prisma.person.count({
        where: {
          identityKeyHash: hashIdentityReference({
            namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
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

  it("imports a new row next to an existing row whose classification differs", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const existingCandidate = await readClassificationCandidate(
      hospital,
      nationalIds.rosterIndependentConflict,
      "กลุ่มเสี่ยง",
    );
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [existingCandidate],
      importDependencies(),
    );
    const [validCandidate, changedCandidate] = await readClassificationCandidates(hospital, [
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
      alreadyExists: 1,
      classificationCreated: 1,
    });
    expect(summary.rows.map(({ result }) => result)).toEqual(["IMPORTED", "ALREADY_EXISTS"]);
    expect(await prisma.patientClassification.count()).toBe(2);
    await expect(readCandidateClassification(changedCandidate)).resolves.toEqual({
      classification: "RISK",
    });
  });

  it("never overwrites a classification another user set after the file was prepared", async () => {
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
      hospital,
      nationalIds.rosterStale,
      "เบาหวาน",
    );
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
    );

    expect(result).toMatchObject({ alreadyExists: 1, classificationCreated: 0 });
    expect(await prisma.patientClassificationHistory.count()).toBe(2);
    await expect(readCandidateClassification(candidate)).resolves.toEqual({
      classification: "DIABETES",
    });
  });

  it("keeps the classification of a patient known at another hospital when importing them into a new one", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id });
    const patient = await provisionPatient(
      otherOwner.actor,
      patientInput(nationalIds.rosterConfirmed, otherHospital.id),
      importDependencies(),
    );
    await setPatientClassification(
      otherOwner.actor,
      { patientHospitalRelationshipId: patient.relationshipId, classification: "RISK" },
      importDependencies(),
    );
    const candidate = await readClassificationCandidate(
      hospital,
      nationalIds.rosterConfirmed,
      "เบาหวาน",
    );

    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
    );

    expect(preview.rows[0]).toMatchObject({
      classification: "READY",
      patientClassification: { status: "CLASSIFICATION_ALREADY_EXISTS" },
    });
    expect(summary).toMatchObject({ imported: 1, classificationCreated: 0 });
    expect(await prisma.patientHospitalRelationship.count()).toBe(2);
    expect(await prisma.patientClassificationHistory.count()).toBe(1);
    await expect(readCandidateClassification(candidate)).resolves.toEqual({
      classification: "RISK",
    });
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
