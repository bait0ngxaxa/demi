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
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { readPatientImportCandidates, type PatientImportUpload } from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  provisionPatient,
  type ProvisionPatientInput,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

const prisma = getPrisma();

const nationalIds = {
  brandNew: "1000000000009",
  reused: "1000000000017",
  idempotent: "1000000000025",
  conflict: "1000000000033",
  relationshipConflict: "1000000000041",
  concurrent: "1000000000050",
  bulkFirst: "1000000000068",
  bulkSecond: "1000000000076",
  bulkConflict: "1000000000084",
  osm: "1000000000092",
  multiRoleBulk: "1000000000106",
  bulkRevalidation: "1000000000114",
};

let actorSequence = 0;

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
  code: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<{ id: string; status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาลทดสอบ ${code}`,
      status,
    },
    select: { id: true, status: true },
  });
}

async function createActor(input: {
  kind: "HOSPITAL" | "OSM";
  hospitalId: string;
  userStatus?: UserStatus;
  relationshipStatus?: MembershipStatus;
  membershipType?: MembershipType;
}): Promise<{ actor: ActorContext; userId: string; personId: string }> {
  actorSequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `integration-patient-actor-${actorSequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `00000000-0000-4000-8000-${String(actorSequence).padStart(12, "0")}`,
      status: input.userStatus ?? UserStatus.ACTIVE,
    },
    select: { id: true, status: true },
  });
  const roles = [input.kind === "HOSPITAL" ? Role.HOSPITAL : Role.OSM];
  await prisma.userRole.create({ data: { userId: user.id, role: roles[0] } });

  const relationshipStatus = input.relationshipStatus ?? MembershipStatus.ACTIVE;
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: input.hospitalId },
    select: { status: true },
  });

  if (input.kind === "HOSPITAL") {
    await prisma.hospitalMembership.create({
      data: {
        userId: user.id,
        hospitalId: input.hospitalId,
        membershipType,
        status: relationshipStatus,
      },
    });
  } else {
    await prisma.osmHospitalRelationship.create({
      data: {
        userId: user.id,
        hospitalId: input.hospitalId,
        status: relationshipStatus,
      },
    });
  }

  return {
    userId: user.id,
    personId: person.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles,
      hospitalMemberships:
        input.kind === "HOSPITAL"
          ? [
              {
                hospitalId: input.hospitalId,
                membershipType,
                profession: null,
                status: relationshipStatus,
                hospitalStatus: hospital.status,
              },
            ]
          : [],
      osmHospitalRelationships:
        input.kind === "OSM"
          ? [
              {
                hospitalId: input.hospitalId,
                status: relationshipStatus,
                hospitalStatus: hospital.status,
              },
            ]
          : [],
    },
  };
}

function patientInput(
  nationalId: string,
  hospitalId: string,
  overrides: Partial<Pick<ProvisionPatientInput, "givenName" | "familyName" | "hospitalNumber">> = {},
): ProvisionPatientInput {
  return {
    identity: { namespace: "thai-national-id", value: nationalId },
    givenName: overrides.givenName ?? "สมชาย",
    familyName: overrides.familyName ?? "ผู้ป่วย",
    hospitalNumber: overrides.hospitalNumber,
    targetHospitalId: hospitalId,
  };
}

async function createXlsxUpload(
  rows: readonly (readonly [string, string, string, string])[],
): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Patients");
  worksheet.addRow(["Thai National ID", "First name", "Last name", "HN"]);

  for (const row of rows) {
    worksheet.addRow([...row]);
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(written);
  const stableBytes = Uint8Array.from(bytes);

  return {
    name: "patients.xlsx",
    size: stableBytes.byteLength,
    arrayBuffer: async () => stableBytes.slice().buffer as ArrayBuffer,
  };
}

async function createRosterXlsxUpload(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Patients");
  worksheet.addRow([...headers]);

  for (const row of rows) {
    worksheet.addRow([...row]);
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(written);
  const stableBytes = Uint8Array.from(bytes);

  return {
    name: "synthetic-roster.xlsx",
    size: stableBytes.byteLength,
    arrayBuffer: async () => stableBytes.slice().buffer as ArrayBuffer,
  };
}

function createFailingTransactionDatabase(): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
        target.$transaction(async (transaction) => {
          await operation(transaction);
          throw new Error("forced transaction failure");
        });
    },
  }) as unknown as PrismaClient;
}

async function createMultiRoleHospitalOsmActor(
  hospitalId: string,
): Promise<{ actor: ActorContext; userId: string; personId: string }> {
  const created = await createActor({ kind: "HOSPITAL", hospitalId });
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
  });

  await prisma.userRole.create({ data: { userId: created.userId, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: {
      userId: created.userId,
      hospitalId,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    ...created,
    actor: {
      ...created.actor,
      roles: [Role.HOSPITAL, Role.OSM],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: hospital.status,
        },
      ],
    },
  };
}

function createDatabaseThatRevokesHospitalBulkScope(
  userId: string,
  hospitalId: string,
): PrismaClient {
  let revoked = false;

  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!revoked) {
          revoked = true;
          await prisma.hospitalMembership.update({
            where: { userId_hospitalId: { userId, hospitalId } },
            data: { status: MembershipStatus.SUSPENDED },
          });
        }

        return target.$transaction(operation);
      };
    },
  }) as unknown as PrismaClient;
}

describe("Phase 5B.1 patient provisioning PostgreSQL workflow", () => {
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

  it("creates a new PatientProfile, Hospital relationship, provisioned User, PATIENT role, and atomic audit", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-NEW");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });

    const result = await provisionPatient(
      actor,
      patientInput(nationalIds.brandNew, hospital.id, { hospitalNumber: "HN-001" }),
    );

    expect(result).toMatchObject({
      outcome: "CREATED",
      hospitalId: hospital.id,
      accountStatus: UserStatus.PROVISIONED,
      reusedExistingUser: false,
    });
    await expect(prisma.patientActivation.count()).resolves.toBe(0);
    await expect(
      prisma.user.findUnique({
        where: { id: result.userId },
        select: { status: true, authSubject: true, roles: { select: { role: true } } },
      }),
    ).resolves.toEqual({
      status: UserStatus.PROVISIONED,
      authSubject: null,
      roles: [{ role: Role.PATIENT }],
    });
    await expect(
      prisma.patientHospitalRelationship.findUnique({
        where: { id: result.relationshipId },
        select: { hospitalId: true, hospitalNumber: true },
      }),
    ).resolves.toEqual({ hospitalId: hospital.id, hospitalNumber: "HN-001" });
    await expect(prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).resolves.toBe(1);
  });

  it("reuses an existing Person and ACTIVE User, preserves existing roles and auth mapping", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-REUSE");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const person = await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({
          namespace: "thai-national-id",
          value: nationalIds.reused,
        }),
        givenName: "สมชาย",
        familyName: "ผู้ป่วย",
      },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        personId: person.id,
        authSubject: "11111111-1111-4111-8111-111111111111",
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });

    const result = await provisionPatient(actor, patientInput(nationalIds.reused, hospital.id));

    expect(result.userId).toBe(user.id);
    expect(result.accountStatus).toBe(UserStatus.ACTIVE);
    expect(await prisma.user.findUnique({ where: { id: user.id }, select: { authSubject: true } })).toEqual({
      authSubject: "11111111-1111-4111-8111-111111111111",
    });
    expect(await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: true }, orderBy: { role: "asc" } })).toEqual([
      { role: Role.OSM },
      { role: Role.PATIENT },
    ]);
    expect(await prisma.person.count()).toBe(2);
  });

  it("allows OSM single provisioning through its active Hospital relationship and reuses a PROVISIONED User", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-OSM-SINGLE");
    const { actor } = await createActor({ kind: "OSM", hospitalId: hospital.id });
    const person = await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalIds.osm }),
        givenName: "อสม.",
        familyName: "เดิม",
      },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.PROVISIONED },
      select: { id: true },
    });

    const result = await provisionPatient(
      actor,
      patientInput(nationalIds.osm, hospital.id, { givenName: "อสม.", familyName: "เดิม" }),
    );

    expect(result).toMatchObject({ outcome: "CREATED", userId: user.id, accountStatus: UserStatus.PROVISIONED, reusedExistingUser: true });
    expect(await prisma.userRole.findUnique({ where: { userId_role: { userId: user.id, role: Role.PATIENT } } })).not.toBeNull();
  });

  it("is idempotent for an exact duplicate without duplicating records or audit events", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-IDEMPOTENT");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const input = patientInput(nationalIds.idempotent, hospital.id, { hospitalNumber: "HN-IDEMPOTENT" });

    const first = await provisionPatient(actor, input);
    const second = await provisionPatient(actor, input);

    expect(first.outcome).toBe("CREATED");
    expect(second).toMatchObject({ outcome: "ALREADY_PROVISIONED", userId: first.userId, patientProfileId: first.patientProfileId, relationshipId: first.relationshipId });
    expect(await prisma.patientProfile.count()).toBe(1);
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
  });

  it("fails closed for identity and relationship conflicts without changing authoritative patient state", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-CONFLICT");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const conflictingPerson = await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalIds.conflict }),
        givenName: "ชื่อเดิม",
        familyName: "นามสกุลเดิม",
      },
      select: { id: true },
    });

    await expect(provisionPatient(actor, patientInput(nationalIds.conflict, hospital.id))).rejects.toMatchObject({
      code: "CONFLICT",
      kind: "IDENTITY_CONFLICT",
    });
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.user.count({ where: { personId: conflictingPerson.id } })).toBe(0);

    const relationshipInput = patientInput(nationalIds.relationshipConflict, hospital.id, { hospitalNumber: "HN-OLD" });
    await provisionPatient(actor, relationshipInput);
    await expect(
      provisionPatient(actor, { ...relationshipInput, hospitalNumber: "HN-NEW" }),
    ).rejects.toMatchObject({ code: "CONFLICT", kind: "RELATIONSHIP_CONFLICT" });
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
  });

  it("denies unauthorized Hospital actors, OSM actors outside their relationship, inactive actors, and inactive relationships", async () => {
    const targetHospital = await createHospital("INTEGRATION-PATIENT-AUTH-TARGET");
    const otherHospital = await createHospital("INTEGRATION-PATIENT-AUTH-OTHER");
    const inactiveHospital = await createHospital("PATIENT-AUTH-INACTIVE", HospitalStatus.SUSPENDED);
    const unauthorized = await createActor({ kind: "HOSPITAL", hospitalId: otherHospital.id });
    const osm = await createActor({ kind: "OSM", hospitalId: otherHospital.id });
    const inactiveActor = await createActor({ kind: "HOSPITAL", hospitalId: targetHospital.id, userStatus: UserStatus.SUSPENDED });
    const inactiveRelationship = await createActor({ kind: "HOSPITAL", hospitalId: targetHospital.id, relationshipStatus: MembershipStatus.SUSPENDED });
    const inactiveHospitalActor = await createActor({ kind: "HOSPITAL", hospitalId: inactiveHospital.id });

    await expect(provisionPatient(unauthorized.actor, patientInput(nationalIds.brandNew, targetHospital.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(provisionPatient(osm.actor, patientInput(nationalIds.osm, targetHospital.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(provisionPatient(inactiveActor.actor, patientInput(nationalIds.reused, targetHospital.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(provisionPatient(inactiveRelationship.actor, patientInput(nationalIds.idempotent, targetHospital.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(provisionPatient(inactiveHospitalActor.actor, patientInput(nationalIds.concurrent, inactiveHospital.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not leave partial authoritative records when the transaction fails", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-ROLLBACK");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });

    await expect(
      provisionPatient(actor, patientInput(nationalIds.brandNew, hospital.id), {
        database: createFailingTransactionDatabase(),
      }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(await prisma.person.count({ where: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalIds.brandNew }) } })).toBe(0);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(0);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(0);
  });

  it("handles concurrent duplicate provisioning without duplicate identity, role, profile, relationship, or audit", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-CONCURRENT");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const input = patientInput(nationalIds.concurrent, hospital.id);

    const outcomes = await Promise.allSettled([
      provisionPatient(actor, input),
      provisionPatient(actor, input),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(await prisma.person.count({ where: { identityKeyHash: hashIdentityReference(input.identity) } })).toBe(1);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(1);
    expect(await prisma.patientProfile.count()).toBe(1);
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
  });

  it("previews Excel rows with READY, INVALID, DUPLICATE_IN_FILE, and ALREADY_EXISTS states", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-PREVIEW");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    await provisionPatient(actor, patientInput(nationalIds.bulkFirst, hospital.id));
    const upload = await createXlsxUpload([
      [nationalIds.bulkFirst, "สมชาย", "ผู้ป่วย", ""],
      [nationalIds.bulkSecond, "สมหญิง", "พร้อมใหม่", "HN-002"],
      [nationalIds.bulkSecond, "สมหญิง", "พร้อมใหม่", "HN-002"],
      ["123", "ข้อมูล", "ไม่ถูกต้อง", ""],
    ]);
    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates);

    expect(preview.rows.map(({ classification }) => classification)).toEqual([
      "ALREADY_EXISTS",
      "DUPLICATE_IN_FILE",
      "DUPLICATE_IN_FILE",
      "INVALID",
    ]);
    expect(preview.rows[0].identityDisplay).not.toContain(nationalIds.bulkFirst);
  });

  it("persists approved roster Baseline fields while keeping deferred fields transient", async () => {
    const hospitalCode = "INTEGRATION-PATIENT-WIDE";
    const hospital = await createHospital(hospitalCode);
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const upload = await createRosterXlsxUpload(
      [
        "Thai National ID",
        "First name",
        "Last name",
        "HN",
        "วันเกิด",
        "เพศ",
        "เบอร์โทร",
        "น้ำหนัก",
        "ประเภทเบาหวาน",
        "โรงพยาบาล",
        "โค้ช",
      ],
      [[
        nationalIds.bulkFirst,
        "ตัวอย่าง",
        "ผู้ป่วย",
        "HN-WIDE-001",
        "04/05/2568",
        "ตัวอย่างเพศ",
        "0812345678",
        72.5,
        "กลุ่มเสี่ยง",
        `โรงพยาบาลทดสอบ ${hospitalCode}`,
        "โค้ชตัวอย่าง",
      ]],
    );

    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates, undefined, {
      effectiveDate: "2026-08-01",
    });

    expect(preview.rows[0]).toMatchObject({
      classification: "READY",
      baselineStatus: "BASELINE_READY",
    });
    expect(preview.rows[0].requirementGatedFields).toEqual(
      expect.arrayContaining(["dateOfBirth", "osmCaregiverName"]),
    );
    expect(preview.rows[0].requirementGatedFields).not.toContain("diabetesClassification");
    expect(preview.rows[0].requirementGatedFields).not.toContain("weight");

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      candidates,
      {},
      { effectiveDate: "2026-08-01" },
    );
    expect(summary).toMatchObject({
      imported: 1,
      needsReview: 0,
      hospitalMismatch: 0,
      classificationCreated: 1,
    });
    expect(summary.file?.requirementGatedFields).toEqual(
      expect.arrayContaining(["dateOfBirth"]),
    );
    expect(summary.file?.requirementGatedFields).not.toContain("diabetesClassification");
    expect(summary.file?.requirementGatedFields).not.toContain("weight");
    const relationshipRecord = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id },
      select: {
        id: true,
        hospitalNumber: true,
        patientProfile: {
          select: {
            dateOfBirth: true,
            gender: true,
            phoneNumber: true,
          },
        },
      },
    });
    expect(
      await prisma.patientBaseline.findUnique({
        where: { patientHospitalRelationshipId: relationshipRecord.id },
        select: { recordedOn: true, weight: true },
      }),
    ).toEqual({ recordedOn: new Date("2026-08-01T00:00:00.000Z"), weight: 72.5 });
    expect(
      await prisma.patientOsmAssignment.count({
        where: { patientHospitalRelationshipId: relationshipRecord.id },
      }),
    ).toBe(0);
    expect(relationshipRecord).toMatchObject({
      hospitalNumber: "HN-WIDE-001",
      patientProfile: {
        dateOfBirth: null,
        gender: null,
        phoneNumber: null,
      },
    });
  });

  it("reports source Hospital text mismatch without changing the authorized target scope", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-MISMATCH");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const upload = await createRosterXlsxUpload(
      ["Thai National ID", "First name", "Last name", "โรงพยาบาล"],
      [[nationalIds.bulkFirst, "ตัวอย่าง", "ผู้ป่วย", "โรงพยาบาลอื่นจากไฟล์"]],
    );

    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates);
    const summary = await importPatientProvisioning(actor, hospital.id, candidates);

    expect(preview.rows[0]).toMatchObject({
      classification: "HOSPITAL_MISMATCH",
      reason: "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก ต้องตรวจสอบก่อนนำเข้า",
    });
    expect(summary).toMatchObject({ imported: 0, hospitalMismatch: 1 });
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });

  it("confirms Hospital Excel import through the core service with an accurate partial-success summary", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-IMPORT");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    await provisionPatient(actor, patientInput(nationalIds.bulkConflict, hospital.id, { hospitalNumber: "HN-OLD" }));
    const upload = await createXlsxUpload([
      [nationalIds.bulkFirst, "สมชาย", "แถวหนึ่ง", "HN-001"],
      [nationalIds.bulkSecond, "สมหญิง", "แถวสอง", "HN-002"],
      [nationalIds.bulkConflict, "สมชาย", "แถวขัดแย้ง", "HN-NEW"],
      ["123", "ข้อมูล", "ไม่ถูกต้อง", ""],
    ]);
    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const summary = await importPatientProvisioning(actor, hospital.id, candidates);

    expect(summary).toMatchObject({
      imported: 2,
      alreadyExists: 0,
      duplicateInFile: 0,
      invalid: 1,
      conflict: 1,
      failed: 0,
    });
    expect(summary.rows.map(({ result }) => result)).toEqual([
      "IMPORTED",
      "IMPORTED",
      "CONFLICT",
      "INVALID",
    ]);
    expect(summary.rows.every(({ identityDisplay }) => !identityDisplay.includes(nationalIds.bulkConflict))).toBe(true);
    expect(await prisma.patientHospitalRelationship.count()).toBe(3);
    expect(await prisma.patientActivation.count()).toBe(0);
  });

  it("revalidates current database state during Excel confirmation instead of trusting the earlier preview", async () => {
    const hospital = await createHospital("PATIENT-IMPORT-REVALIDATE");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const upload = await createXlsxUpload([[nationalIds.bulkRevalidation, "สมชาย", "ตรวจซ้ำ", "HN-NEW"]]);
    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates);

    expect(preview.rows[0]?.classification).toBe("READY");
    await provisionPatient(
      actor,
      patientInput(nationalIds.bulkRevalidation, hospital.id, {
        familyName: "ตรวจซ้ำ",
        hospitalNumber: "HN-OLD",
      }),
    );

    const summary = await importPatientProvisioning(actor, hospital.id, candidates);

    expect(summary).toMatchObject({ imported: 0, conflict: 1, failed: 0 });
    expect(summary.rows[0]).toMatchObject({ result: "CONFLICT", reason: "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน" });
  });

  it("does not allow OSM to use the Hospital-only bulk import adapter", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-OSM-BULK");
    const { actor } = await createActor({ kind: "OSM", hospitalId: hospital.id });
    const upload = await createXlsxUpload([[nationalIds.osm, "อสม.", "ทดสอบ", ""]]);
    const candidates = await readPatientImportCandidates(upload, hospital.id);

    await expect(previewPatientProvisioning(actor, hospital.id, candidates)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(importPatientProvisioning(actor, hospital.id, candidates)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let a multi-role actor fall back to OSM scope after Hospital bulk scope is revoked", async () => {
    const hospital = await createHospital("PATIENT-MULTI-ROLE-BULK");
    const { actor, userId } = await createMultiRoleHospitalOsmActor(hospital.id);
    const upload = await createXlsxUpload([[nationalIds.multiRoleBulk, "หลายบทบาท", "ทดสอบ", ""]]);
    const candidates = await readPatientImportCandidates(upload, hospital.id);
    const database = createDatabaseThatRevokesHospitalBulkScope(userId, hospital.id);

    await expect(
      importPatientProvisioning(actor, hospital.id, candidates, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      await prisma.osmHospitalRelationship.findUnique({
        where: { userId_hospitalId: { userId, hospitalId: hospital.id } },
        select: { status: true },
      }),
    ).toEqual({ status: MembershipStatus.ACTIVE });
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });
});
