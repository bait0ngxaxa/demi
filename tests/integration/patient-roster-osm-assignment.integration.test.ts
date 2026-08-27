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
  assignOsmToPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import {
  listEligibleRosterOsmCandidates,
  normalizeRosterOsmCaregiverName,
} from "@/modules/patient-assignment/services/patient-osm-roster-resolver";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  type PatientImportOsmAssignmentChoice,
  type PatientProvisioningServiceDependencies,
  type PatientProvisioningImportCandidate,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  readPatientImportCandidates,
  type PatientImportUpload,
} from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";

const prisma = getPrisma();
const transactionNow = new Date("2026-08-27T05:00:00.000Z");
let sequence = 0;

type RosterRow = {
  nationalId: string;
  caregiver?: string | null;
  classification?: string | null;
  weight?: number | null;
};

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
      hospitalCode: `PHASE-16D4-${sequence}`,
      name: `โรงพยาบาลสังเคราะห์ Phase 16D.4 ${sequence}`,
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
    data: { identityKeyHash: `phase-16d4-actor-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.OWNER;
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
      hospitalMemberships: [{
        hospitalId: input.hospitalId,
        membershipType,
        profession: null,
        status: membershipStatus,
        hospitalStatus: hospital.status,
      }],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmUser(input: {
  hospitalId: string;
  givenName: string;
  familyName: string;
  userStatus?: UserStatus;
  relationshipStatus?: MembershipStatus;
  additionalHospitalIds?: readonly string[];
}): Promise<{ userId: string; personId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `phase-16d4-osm-${sequence}`,
      givenName: input.givenName,
      familyName: input.familyName,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: input.userStatus ?? UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  const hospitalIds = [input.hospitalId, ...(input.additionalHospitalIds ?? [])];
  await prisma.osmHospitalRelationship.createMany({
    data: hospitalIds.map((hospitalId) => ({
      userId: user.id,
      hospitalId,
      status: input.relationshipStatus ?? MembershipStatus.ACTIVE,
    })),
  });

  return { userId: user.id, personId: person.id };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `phase-16d4-admin-${sequence}` },
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

function importDependencies(
  database: PrismaClient = prisma,
  now = transactionNow,
  transactionRetries = 3,
): PatientProvisioningServiceDependencies {
  return { database, now: () => now, transactionRetries };
}

async function createRosterUpload(rows: readonly RosterRow[]): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Synthetic roster");
  const includeWeight = rows.some(({ weight }) => weight !== undefined);
  const headers = [
    "Thai National ID",
    "First name",
    "Last name",
    "HN",
    "ประเภทเบาหวาน",
    "ชื่อผู้ดูแล (อสม.)",
    ...(includeWeight ? ["น้ำหนัก"] : []),
  ];
  worksheet.addRow(headers);

  for (const row of rows) {
    worksheet.addRow([
      row.nationalId,
      "ผู้ป่วยสังเคราะห์",
      "แถวทดสอบ",
      `HN-${row.nationalId.slice(-4)}`,
      row.classification ?? null,
      row.caregiver ?? null,
      ...(includeWeight ? [row.weight ?? null] : []),
    ]);
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name: "synthetic-phase-16d4.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

async function readRosterCandidates(
  hospitalId: string,
  rows: readonly RosterRow[],
): Promise<Awaited<ReturnType<typeof readPatientImportCandidates>>> {
  return readPatientImportCandidates(await createRosterUpload(rows), hospitalId);
}

async function readRosterCandidate(
  hospitalId: string,
  row: RosterRow,
): Promise<PatientProvisioningImportCandidate> {
  const [candidate] = await readRosterCandidates(hospitalId, [row]);

  if (!candidate) {
    throw new Error("Synthetic roster candidate was not created");
  }

  return candidate;
}

function createOsmChoice(
  candidate: PatientProvisioningImportCandidate,
  candidateOsmUserId: string,
  currentOsmUserId: string | null,
  explicitReassignment = false,
  resolutionStatus: "OSM_MATCHED" | "OSM_AMBIGUOUS" = "OSM_MATCHED",
): PatientImportOsmAssignmentChoice {
  const sourceCaregiverName = candidate.canonicalRow.caregiverCandidates.osmCaregiverName;
  const normalizedSourceCaregiverName = normalizeRosterOsmCaregiverName(sourceCaregiverName);

  if (!sourceCaregiverName || !normalizedSourceCaregiverName) {
    throw new Error("Synthetic roster candidate has no caregiver source");
  }

  return {
    rowNumber: candidate.rowNumber,
    resolutionStatus,
    sourceCaregiverName,
    normalizedSourceCaregiverName,
    candidateOsmUserId,
    currentOsmUserId,
    explicitReassignment,
  };
}

async function readActiveAssignment(relationshipId: string): Promise<{
  id: string;
  osmUserId: string;
  endedAt: Date | null;
} | null> {
  return prisma.patientOsmAssignment.findFirst({
    where: { patientHospitalRelationshipId: relationshipId, endedAt: null },
    select: { id: true, osmUserId: true, endedAt: true },
  });
}

function createAssignmentFailureDatabase(): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return (
        operation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        options?: {
          maxWait?: number;
          timeout?: number;
          isolationLevel?: Prisma.TransactionIsolationLevel;
        },
      ) =>
        target.$transaction(async (transaction) => {
          const failingAssignment = new Proxy(transaction.patientOsmAssignment, {
            get(delegate, delegateProperty, delegateReceiver): unknown {
              if (delegateProperty === "create") {
                return async (): Promise<never> => {
                  throw new Error("forced OSM assignment write failure");
                };
              }

              return Reflect.get(delegate, delegateProperty, delegateReceiver);
            },
          });
          const transactionWithFailure = new Proxy(transaction, {
            get(transactionTarget, transactionProperty, transactionReceiver): unknown {
              if (transactionProperty === "patientOsmAssignment") {
                return failingAssignment;
              }

              return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            },
          });

          return operation(transactionWithFailure as unknown as Prisma.TransactionClient);
        }, options);
    },
  }) as unknown as PrismaClient;
}

describe("Phase 16D.4 roster OSM resolution and assignment", () => {
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

  it("resolves only active exact-name OSM candidates in the selected active Hospital", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const suspendedHospital = await createHospital(HospitalStatus.SUSPENDED);
    const targetA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
    });
    const targetB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
    });
    await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
      userStatus: UserStatus.SUSPENDED,
    });
    await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
      relationshipStatus: MembershipStatus.SUSPENDED,
    });
    await createOsmUser({
      hospitalId: otherHospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
    });
    await createOsmUser({
      hospitalId: suspendedHospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อซ้ำ",
    });

    const candidates = await listEligibleRosterOsmCandidates(prisma, hospital.id);
    expect(candidates.map(({ osmUserId }) => osmUserId).sort()).toEqual(
      [targetA.userId, targetB.userId].sort(),
    );

    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001000",
      caregiver: "อสม.สังเคราะห์ ชื่อซ้ำ",
    });
    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);

    expect(preview.rows[0]).toMatchObject({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        resolutionStatus: "OSM_AMBIGUOUS",
        assignmentStatus: null,
        candidates: [
          { displayName: "อสม.สังเคราะห์ ชื่อซ้ำ" },
          { displayName: "อสม.สังเคราะห์ ชื่อซ้ำ" },
        ],
      },
    });
    await expect(listEligibleRosterOsmCandidates(prisma, suspendedHospital.id)).resolves.toEqual([]);
  });

  it("does not fuzzy-match a typo and reports a missing caregiver without mutation", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osm = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สะกดตรง",
    });
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001018",
      caregiver: "อสม.สังเคราะห์ สะกดผิด",
    });

    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
    );

    expect(osm.userId).toBeTruthy();
    expect(preview.rows[0]).toMatchObject({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: { resolutionStatus: "OSM_NOT_FOUND" },
    });
    expect(summary).toMatchObject({ imported: 0, needsReview: 1, osmNotFound: 1 });
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
  });

  it("creates an assignment, then repeats it as a same-assignment NOOP without new history", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osm = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ผู้ดูแลหนึ่ง",
    });
    const source = {
      nationalId: "1000000001026",
      caregiver: "อสม.สังเคราะห์ ผู้ดูแลหนึ่ง",
    };
    const candidate = await readRosterCandidate(hospital.id, source);
    const choice = createOsmChoice(candidate, osm.userId, null);

    await expect(
      previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma),
    ).resolves.toMatchObject({
      rows: [{
        classification: "READY",
        patientOsmAssignment: {
          resolutionStatus: "OSM_MATCHED",
          assignmentStatus: "OSM_ASSIGNMENT_READY",
        },
      }],
    });
    const first = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { osmAssignmentChoices: [choice] },
    );
    expect(first).toMatchObject({ imported: 1, osmAssigned: 1 });

    const repeat = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { osmAssignmentChoices: [choice] },
    );
    expect(repeat).toMatchObject({ alreadyExists: 1, osmAlreadyAssigned: 1 });
    const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: source.nationalId,
        }),
      } } },
      select: { id: true },
    });
    expect(await prisma.patientOsmAssignment.count({
      where: { patientHospitalRelationshipId: relationship.id },
    })).toBe(1);
    await expect(readActiveAssignment(relationship.id)).resolves.toMatchObject({ osmUserId: osm.userId });
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_assigned" } })).toBe(1);
  });

  it("requires explicit OWNER consent for reassignment and preserves ended assignment history", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ผู้ดูแลเอ",
    });
    const osmB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ผู้ดูแลบี",
    });
    const firstCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001034",
      caregiver: "อสม.สังเคราะห์ ผู้ดูแลเอ",
    });
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [firstCandidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(firstCandidate, osmA.userId, null)] },
    );

    const secondCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001034",
      caregiver: "อสม.สังเคราะห์ ผู้ดูแลบี",
    });
    const conflictPreview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [secondCandidate],
      prisma,
    );
    expect(conflictPreview.rows[0]).toMatchObject({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
        currentCaregiver: { displayName: "อสม.สังเคราะห์ ผู้ดูแลเอ" },
        resolvedCandidate: { displayName: "อสม.สังเคราะห์ ผู้ดูแลบี" },
      },
    });

    const unconfirmed = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [secondCandidate],
      importDependencies(),
    );
    expect(unconfirmed).toMatchObject({ needsReview: 1, osmAssignmentConflict: 1 });
    const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001034",
        }),
      } } },
      select: { id: true },
    });
    await expect(readActiveAssignment(relationship.id)).resolves.toMatchObject({ osmUserId: osmA.userId });

    const confirmed = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [secondCandidate],
      importDependencies(),
      {
        osmAssignmentChoices: [createOsmChoice(
          secondCandidate,
          osmB.userId,
          osmA.userId,
          true,
        )],
      },
    );
    expect(confirmed).toMatchObject({ alreadyExists: 1, osmReassigned: 1 });
    const history = await prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: relationship.id },
      orderBy: { createdAt: "asc" },
      select: { osmUserId: true, endedAt: true, endedByUserId: true },
    });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ osmUserId: osmA.userId, endedByUserId: owner.userId });
    expect(history[1]).toMatchObject({ osmUserId: osmB.userId, endedAt: null });
  });

  it("lets an OWNER select one exact candidate from an ambiguous set", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อกำกวม",
    });
    const osmB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ชื่อกำกวม",
    });
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001042",
      caregiver: "อสม.สังเคราะห์ ชื่อกำกวม",
    });

    const preview = await previewPatientProvisioning(owner.actor, hospital.id, [candidate], prisma);
    expect(preview.rows[0]?.patientOsmAssignment).toMatchObject({
      resolutionStatus: "OSM_AMBIGUOUS",
      assignmentStatus: null,
    });
    const unresolved = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
    );
    expect(unresolved).toMatchObject({ imported: 0, needsReview: 1, osmAmbiguous: 1 });

    const selected = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      {
        osmAssignmentChoices: [createOsmChoice(
          candidate,
          osmB.userId,
          null,
          false,
          "OSM_AMBIGUOUS",
        )],
      },
    );
    expect(selected).toMatchObject({ imported: 1, osmAssigned: 1 });
    const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001042",
        }),
      } } },
      select: { id: true },
    });
    await expect(readActiveAssignment(relationship.id)).resolves.toMatchObject({ osmUserId: osmB.userId });
    expect(osmA.userId).not.toBe(osmB.userId);
  });

  it("keeps MEMBER imports safe: new assignments and reassignments require an OWNER", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const member = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
    });
    const osmA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สมาชิกทดสอบเอ",
    });
    const osmB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สมาชิกทดสอบบี",
    });
    const newCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001059",
      caregiver: "อสม.สังเคราะห์ สมาชิกทดสอบเอ",
    });
    const memberPreview = await previewPatientProvisioning(
      member.actor,
      hospital.id,
      [newCandidate],
      prisma,
    );
    expect(memberPreview).toMatchObject({
      canManageOsmAssignment: false,
      rows: [{
        classification: "NEEDS_REVIEW",
        patientOsmAssignment: { assignmentStatus: "OSM_OWNER_REQUIRED" },
      }],
    });
    const memberNew = await importPatientProvisioning(
      member.actor,
      hospital.id,
      [newCandidate],
      importDependencies(),
    );
    expect(memberNew).toMatchObject({ imported: 0, needsReview: 1, osmOwnerRequired: 1 });
    expect(await prisma.patientProfile.count()).toBe(0);

    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [newCandidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(newCandidate, osmA.userId, null)] },
    );
    const same = await importPatientProvisioning(
      member.actor,
      hospital.id,
      [newCandidate],
      importDependencies(),
    );
    expect(same).toMatchObject({ alreadyExists: 1, osmAlreadyAssigned: 1 });

    const differentCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001059",
      caregiver: "อสม.สังเคราะห์ สมาชิกทดสอบบี",
    });
    const memberReassign = await importPatientProvisioning(
      member.actor,
      hospital.id,
      [differentCandidate],
      importDependencies(),
    );
    expect(memberReassign).toMatchObject({ needsReview: 1, osmOwnerRequired: 1 });
    const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001059",
        }),
      } } },
      select: { id: true },
    });
    await expect(readActiveAssignment(relationship.id)).resolves.toMatchObject({ osmUserId: osmA.userId });
    expect(osmB.userId).not.toBe(osmA.userId);
  });

  it("keeps unresolved rows independent and never clears an existing assignment", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osm = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "อิสระ",
    });
    const existingCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001075",
      caregiver: "อสม.สังเคราะห์ อิสระ",
    });
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [existingCandidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(existingCandidate, osm.userId, null)] },
    );

    const notFoundCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001075",
      caregiver: "ผู้ดูแลสังเคราะห์ที่ไม่มีบัญชี",
    });
    const validCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001083",
      caregiver: "อสม.สังเคราะห์ อิสระ",
    });
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [notFoundCandidate, validCandidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(validCandidate, osm.userId, null)] },
    );

    expect(summary).toMatchObject({
      imported: 1,
      needsReview: 1,
      osmAssigned: 1,
      osmNotFound: 1,
    });
    expect(summary.rows.map(({ result }) => result)).toEqual(["NEEDS_REVIEW", "IMPORTED"]);
    expect(await prisma.patientProfile.count()).toBe(2);
    const existingRelationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001075",
        }),
      } } },
      select: { id: true },
    });
    await expect(readActiveAssignment(existingRelationship.id)).resolves.toMatchObject({ osmUserId: osm.userId });
  });

  it("rolls back core, Baseline, classification, assignment, and audits on assignment failure", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osm = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "อะตอมมิก",
    });
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001091",
      caregiver: "อสม.สังเคราะห์ อะตอมมิก",
      classification: "กลุ่มเสี่ยง",
      weight: 72.5,
    });
    const choice = createOsmChoice(candidate, osm.userId, null);
    const summary = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(createAssignmentFailureDatabase()),
      { effectiveDate: "2026-08-01", osmAssignmentChoices: [choice] },
    );
    const identityHash = hashIdentityReference(candidate.input?.identity ?? {
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: "1000000001091",
    });

    expect(summary).toMatchObject({ imported: 0, failed: 1 });
    expect(await prisma.person.count({ where: { identityKeyHash: identityHash } })).toBe(0);
    expect(await prisma.user.count({ where: { person: { identityKeyHash: identityHash } } })).toBe(0);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(0);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.patientBaseline.count()).toBe(0);
    expect(await prisma.patientClassification.count()).toBe(0);
    expect(await prisma.patientClassificationHistory.count()).toBe(0);
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("requires both classification and OSM confirmations before a combined row commits", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "คู่ข้อมูลเอ",
    });
    const osmB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "คู่ข้อมูลบี",
    });
    const firstCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001109",
      caregiver: "อสม.สังเคราะห์ คู่ข้อมูลเอ",
      classification: "กลุ่มเสี่ยง",
    });
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [firstCandidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(firstCandidate, osmA.userId, null)] },
    );

    const changedCandidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001109",
      caregiver: "อสม.สังเคราะห์ คู่ข้อมูลบี",
      classification: "เบาหวาน",
    });
    const preview = await previewPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      prisma,
    );
    expect(preview.rows[0]).toMatchObject({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
      patientOsmAssignment: { assignmentStatus: "OSM_ASSIGNMENT_CONFLICT" },
    });

    const classificationChoice = {
      rowNumber: changedCandidate.rowNumber,
      currentClassification: "RISK" as const,
      sourceClassification: "DIABETES" as const,
    };
    const osmChoice = createOsmChoice(changedCandidate, osmB.userId, osmA.userId, true);
    const withoutEither = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      importDependencies(),
    );
    const classificationOnly = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      importDependencies(),
      { classificationReconciliationChoices: [classificationChoice] },
    );
    const osmOnly = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      importDependencies(),
      { osmAssignmentChoices: [osmChoice] },
    );
    expect(withoutEither).toMatchObject({ needsReview: 1 });
    expect(classificationOnly).toMatchObject({ needsReview: 1 });
    expect(osmOnly).toMatchObject({ needsReview: 1 });
    expect(await prisma.patientClassificationHistory.count()).toBe(1);
    expect(await prisma.patientOsmAssignment.count()).toBe(1);

    const both = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [changedCandidate],
      importDependencies(),
      {
        classificationReconciliationChoices: [classificationChoice],
        osmAssignmentChoices: [osmChoice],
      },
    );
    expect(both).toMatchObject({
      alreadyExists: 1,
      classificationChanged: 1,
      osmReassigned: 1,
    });
    expect(await prisma.patientClassificationHistory.count()).toBe(2);
    expect(await prisma.patientOsmAssignment.count()).toBe(2);
    expect(await prisma.patientClassification.findFirstOrThrow()).toMatchObject({
      classification: "DIABETES",
    });
  });

  it("rejects stale reassignment consent after a newer assignment, but accepts a safe current-target NOOP", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmA = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สแตลเอ",
    });
    const osmB = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สแตลบี",
    });
    const osmC = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "สแตลซี",
    });
    const first = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001117",
      caregiver: "อสม.สังเคราะห์ สแตลเอ",
    });
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [first],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(first, osmA.userId, null)] },
    );
    const toB = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001117",
      caregiver: "อสม.สังเคราะห์ สแตลบี",
    });
    const staleChoice = createOsmChoice(toB, osmB.userId, osmA.userId, true);
    await previewPatientProvisioning(owner.actor, hospital.id, [toB], prisma);
    const firstRelationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001117",
        }),
      } } },
      select: { id: true },
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: firstRelationship.id,
      osmUserId: osmC.userId,
    });
    const stale = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [toB],
      importDependencies(),
      { osmAssignmentChoices: [staleChoice] },
    );
    expect(stale).toMatchObject({ needsReview: 1 });
    await expect(readActiveAssignment(firstRelationship.id)).resolves.toMatchObject({ osmUserId: osmC.userId });

    const second = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001125",
      caregiver: "อสม.สังเคราะห์ สแตลเอ",
    });
    await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [second],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(second, osmA.userId, null)] },
    );
    const secondToB = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001125",
      caregiver: "อสม.สังเคราะห์ สแตลบี",
    });
    const secondRelationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001125",
        }),
      } } },
      select: { id: true },
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: secondRelationship.id,
      osmUserId: osmB.userId,
    });
    const safeNoop = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [secondToB],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(secondToB, osmB.userId, osmA.userId, true)] },
    );
    expect(safeNoop).toMatchObject({ alreadyExists: 1, osmAlreadyAssigned: 1 });
    await expect(readActiveAssignment(secondRelationship.id)).resolves.toMatchObject({ osmUserId: osmB.userId });
  });

  it("keeps concurrent initial roster confirmations to one active assignment", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osm = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "พร้อมกัน",
    });
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001133",
      caregiver: "อสม.สังเคราะห์ พร้อมกัน",
    });
    const choice = createOsmChoice(candidate, osm.userId, null);

    const results = await Promise.allSettled([
      importPatientProvisioning(
        owner.actor,
        hospital.id,
        [candidate],
        importDependencies(prisma, transactionNow, 5),
        { osmAssignmentChoices: [choice] },
      ),
      importPatientProvisioning(
        owner.actor,
        hospital.id,
        [candidate],
        importDependencies(prisma, transactionNow, 5),
        { osmAssignmentChoices: [choice] },
      ),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id, patientProfile: { person: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: "1000000001133",
        }),
      } } },
      select: { id: true },
    });
    expect(await prisma.patientOsmAssignment.count({
      where: { patientHospitalRelationshipId: relationship.id, endedAt: null },
    })).toBe(1);
    await expect(readActiveAssignment(relationship.id)).resolves.toMatchObject({ osmUserId: osm.userId });
    expect(await prisma.auditEvent.count({ where: { action: "patient.osm_assigned" } })).toBe(1);
  });

  it("keeps OSM and ADMIN outside roster assignment authority", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor({ hospitalId: hospital.id });
    const osmActorUser = await createOsmUser({
      hospitalId: hospital.id,
      givenName: "อสม.สังเคราะห์",
      familyName: "ผู้ปฏิบัติงาน",
    });
    const osmActor: ActorContext = {
      userId: osmActorUser.userId,
      personId: osmActorUser.personId,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [{
        hospitalId: hospital.id,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
    };
    const admin = await createAdminActor();
    const candidate = await readRosterCandidate(hospital.id, {
      nationalId: "1000000001141",
      caregiver: "อสม.สังเคราะห์ ผู้ปฏิบัติงาน",
    });

    const ownerResult = await importPatientProvisioning(
      owner.actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { osmAssignmentChoices: [createOsmChoice(candidate, osmActorUser.userId, null)] },
    );
    expect(ownerResult).toMatchObject({ imported: 1, osmAssigned: 1 });

    await expect(
      importPatientProvisioning(osmActor, hospital.id, [candidate], importDependencies()),
    ).rejects.toThrow();
    await expect(
      importPatientProvisioning(admin, hospital.id, [candidate], importDependencies()),
    ).rejects.toThrow();
  });
});
