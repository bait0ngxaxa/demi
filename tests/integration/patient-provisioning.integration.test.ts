import {
  IdentityAssurance,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore, resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";
import { authenticateWithPassword } from "@/modules/auth/services/authentication-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createCaregiverInvitation } from "@/modules/family/services/caregiver-relationship-service";
import { createCaregiverAccountFromInvitation } from "@/modules/family/services/caregiver-account-claim-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { importPatientProvisioning,
  previewPatientProvisioning,
  type ProvisionPatientInput } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import {
  readTemplateCandidates,
  type ImportTestHospital,
  type TemplateRow,
} from "./support/patient-import-template-upload";

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
  await prisma.caregiverAppointmentGrant.deleteMany();
  await prisma.caregiverResourceGrant.deleteMany();
  await prisma.caregiverRelationship.deleteMany();
  await prisma.caregiverInvitation.deleteMany();
  await prisma.userTakeoverLock.deleteMany();
  await prisma.$executeRaw`DELETE FROM "PublicSelfRegistrationRateLimitBucket" WHERE "category" IN ('CG_PATIENT', 'CG_IDENTITY')`;
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

async function createHospital(
  code: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<ImportTestHospital & { status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาลทดสอบ ${code}`,
      status,
    },
    select: { id: true, hospitalCode: true, name: true, status: true },
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
  const membershipType = input.membershipType ?? MembershipType.OWNER;
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

function templateRow(
  nationalId: string,
  givenName: string,
  familyName: string,
  hospitalNumber: string,
  extra: TemplateRow = {},
): TemplateRow {
  return {
    nationalId,
    givenName,
    familyName,
    hospitalNumber: hospitalNumber || null,
    ...extra,
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
          await prisma.hospitalMembership.updateMany({ where: { userId, hospitalId, status: { not: "ENDED" } },
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

  it("quarantines a caregiver-claimed identity reused as a Patient and keeps caregiver sharing recorded", async () => {
    const hospital = await createHospital("INTEG-CARE-REUSE");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const identityKeyHash = hashIdentityReference({
      namespace: "thai-national-id",
      value: nationalIds.reused,
    });
    const inviterPerson = await prisma.person.create({
      data: {
        identityKeyHash: `caregiver-provision-inviter-${randomUUID()}`,
        givenName: "ผู้ป่วย",
        familyName: "ผู้เชิญ",
      },
      select: { id: true },
    });
    const inviter = await prisma.user.create({
      data: {
        personId: inviterPerson.id,
        authSubject: randomUUID(),
        status: UserStatus.ACTIVE,
        roles: { create: { role: Role.PATIENT } },
      },
      select: { id: true },
    });
    await prisma.patientProfile.create({ data: { personId: inviterPerson.id } });
    const patientActor: ActorContext = {
      userId: inviter.id,
      personId: inviterPerson.id,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const invite = await createCaregiverInvitation(patientActor, {
      nationalId: nationalIds.reused,
      resources: ["PROFILE_SUMMARY"],
    }, {
      database: prisma,
      rateLimiter: { consume: async () => true },
      gates: { delegatedReadEnabled: true, planMedicationEnabled: false },
    });
    const authSubject = "11111111-1111-4111-8111-111111111112";
    const claim = await createCaregiverAccountFromInvitation({
      token: invite.plaintextToken,
      nationalId: nationalIds.reused,
      givenName: "ชื่อที่ผู้ดูแลแจ้ง",
      familyName: "นามสกุลที่ผู้ดูแลแจ้ง",
      password: "caregiver-test-password-2026",
      passwordConfirmation: "caregiver-test-password-2026",
    }, { ipAddress: "203.0.113.12" }, {
      database: prisma,
      rateLimiter: { consume: async () => true },
      gates: { delegatedReadEnabled: true, planMedicationEnabled: false },
      createProviderIdentity: async ({ userId }) => ({ authSubject, providerLoginAlias: `caregiver-${userId}@test.invalid` }),
      deleteProviderIdentity: async () => {},
    });
    const revokeProviderSessions = vi.fn(async () => "CONFIRMED" as const);

    const result = await provisionPatient(actor, patientInput(nationalIds.reused, hospital.id), { revokeProviderSessions });

    expect(result).toMatchObject({ personId: expect.any(String), userId: claim.userId, accountStatus: UserStatus.SUSPENDED, reusedExistingUser: true });
    expect(revokeProviderSessions).toHaveBeenCalledOnce();
    expect(revokeProviderSessions).toHaveBeenCalledWith(authSubject);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: claim.userId } })).toMatchObject({
      status: UserStatus.SUSPENDED,
      identityAssurance: IdentityAssurance.CAREGIVER_INVITATION,
      authSubject,
    });
    expect(await prisma.userTakeoverLock.findUniqueOrThrow({ where: { userId: claim.userId } })).toMatchObject({
      hospitalId: hospital.id,
      providerState: "CONFIRMED",
    });
    expect(await prisma.user.count({ where: { personId: result.personId } })).toBe(1);
    expect(await prisma.person.count({ where: { identityKeyHash } })).toBe(1);
    expect(await prisma.person.findUniqueOrThrow({
      where: { id: result.personId },
      select: { givenName: true, familyName: true, nameIsSelfAsserted: true },
    })).toEqual({ givenName: "สมชาย", familyName: "ผู้ป่วย", nameIsSelfAsserted: false });
    expect(await prisma.userRole.findMany({
      where: { userId: claim.userId },
      select: { role: true },
      orderBy: { role: "asc" },
    })).toEqual(expect.arrayContaining([{ role: Role.CAREGIVER }, { role: Role.PATIENT }]));
    expect(await prisma.caregiverRelationship.findUniqueOrThrow({
      where: { id: claim.relationshipId }, select: { status: true },
    })).toEqual({ status: "ACTIVE" });
    expect(await prisma.caregiverResourceGrant.count({ where: { caregiverUserId: claim.userId, status: "ACTIVE" } })).toBe(1);
    expect(await resolveActorAccessByUserId(claim.userId, createActorContextStore(prisma))).toEqual({
      status: "ACCOUNT_NOT_ACTIVE",
      accountStatus: UserStatus.SUSPENDED,
    });
    const loginProvider = {
      signInWithPassword: vi.fn(async () => ({ data: { user: { id: authSubject } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: authSubject } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    };
    await expect(authenticateWithPassword({ nationalId: nationalIds.reused, password: "caregiver-test-password-2026" }, {
      provider: loginProvider,
      actorStore: createActorContextStore(prisma),
    })).resolves.toEqual({ status: "APPLICATION_ACCESS_DENIED", reason: "ACCOUNT_NOT_ACTIVE" });
    expect(loginProvider.signOut).toHaveBeenCalledOnce();
  });

  it("keeps an ACTIVE HOSPITAL_PROOFED Patient usable when another Hospital provisions the same identity", async () => {
    const sourceHospital = await createHospital("INTEG-PATIENT-PROOFED-SOURCE");
    const targetHospital = await createHospital("INTEG-PATIENT-PROOFED-TARGET");
    const { actor: sourceOwner } = await createActor({ kind: "HOSPITAL", hospitalId: sourceHospital.id });
    const { actor: targetOwner } = await createActor({ kind: "HOSPITAL", hospitalId: targetHospital.id });
    const first = await provisionPatient(sourceOwner, patientInput(nationalIds.reused, sourceHospital.id));
    const authSubject = randomUUID();
    await prisma.user.update({ where: { id: first.userId }, data: { status: UserStatus.ACTIVE, authSubject } });

    const result = await provisionPatient(targetOwner, patientInput(nationalIds.reused, targetHospital.id));

    expect(result).toMatchObject({ userId: first.userId, accountStatus: UserStatus.ACTIVE, reusedExistingUser: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: first.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      authSubject,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
    });
    expect(await prisma.patientHospitalRelationship.count({ where: { patientProfileId: first.patientProfileId, hospitalId: targetHospital.id, endedAt: null } })).toBe(1);
    expect(await prisma.userTakeoverLock.findUnique({ where: { userId: first.userId } })).toBeNull();
  });

  it("denies OSM patient creation through the internal import row boundary", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-OSM-DENIED");
    const { actor } = await createActor({ kind: "OSM", hospitalId: hospital.id });
    await expect(provisionPatient(actor, patientInput(nationalIds.osm, hospital.id))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patientProfile.count()).toBe(0);
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
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.bulkFirst, "สมชาย", "ผู้ป่วย", ""),
      templateRow(nationalIds.bulkSecond, "สมหญิง", "พร้อมใหม่", "HN-002"),
      templateRow(nationalIds.bulkSecond, "สมหญิง", "พร้อมใหม่", "HN-002"),
      templateRow("123", "ข้อมูล", "ไม่ถูกต้อง", ""),
    ]);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates);

    expect(preview.rows.map(({ classification }) => classification)).toEqual([
      "ALREADY_EXISTS",
      "DUPLICATE_IN_FILE",
      "DUPLICATE_IN_FILE",
      "INVALID",
    ]);
    expect(preview.rows[0].identityDisplay).not.toContain(nationalIds.bulkFirst);
  });

  it("persists roster Baseline, classification and profiles with correct global and hospital ownership", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-WIDE");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.bulkFirst, "ตัวอย่าง", "ผู้ป่วย", "HN-WIDE-001", {
        dateOfBirth: "04/05/2568",
        gender: "ตัวอย่างเพศ",
        phoneNumber: "0812345678",
        weight: 72.5,
        diabetesClassification: "กลุ่มเสี่ยง",
      }),
    ]);
    const preview = await previewPatientProvisioning(actor, hospital.id, candidates, undefined, {
      effectiveDate: "2026-08-01",
    });

    expect(preview.rows[0]).toMatchObject({
      classification: "READY",
      baselineStatus: "BASELINE_READY",
    });
    expect(preview.rows[0].requirementGatedFields).toEqual([]);
    expect(preview.rows[0].requirementGatedFields).not.toContain("diabetesClassification");
    expect(preview.rows[0].requirementGatedFields).not.toContain("weight");

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      candidates,
      {},
      { effectiveDate: "2026-08-01" },
    );
    expect(summary).toMatchObject({ imported: 1, classificationCreated: 1 });
    expect(summary.file?.requirementGatedFields).toEqual([]);
    expect(summary.file?.requirementGatedFields).not.toContain("diabetesClassification");
    expect(summary.file?.requirementGatedFields).not.toContain("weight");
    const relationshipRecord = await prisma.patientHospitalRelationship.findFirstOrThrow({
      where: { hospitalId: hospital.id },
      select: {
        id: true,
        hospitalNumber: true,
        hospitalProfile: { select: { gender: true, phoneNumber: true } },
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
      hospitalProfile: { gender: "ตัวอย่างเพศ", phoneNumber: "0812345678" },
      patientProfile: {
        dateOfBirth: new Date("2025-05-04T00:00:00.000Z"),
        gender: null,
        phoneNumber: null,
      },
    });
  });

  it("rejects a file bound to another hospital before any row is read or written", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-FILE-A");
    const otherHospital = await createHospital("INTEGRATION-PATIENT-FILE-B");
    await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });

    await expect(
      readTemplateCandidates(
        otherHospital,
        [templateRow(nationalIds.bulkFirst, "ตัวอย่าง", "ผู้ป่วย", "")],
        {},
        hospital,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });

  it("confirms Hospital Excel import through the core service with an accurate partial-success summary", async () => {
    const hospital = await createHospital("INTEGRATION-PATIENT-IMPORT");
    const { actor } = await createActor({ kind: "HOSPITAL", hospitalId: hospital.id });
    await provisionPatient(actor, patientInput(nationalIds.bulkConflict, hospital.id, { hospitalNumber: "HN-OLD" }));
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.bulkFirst, "สมชาย", "แถวหนึ่ง", "HN-001"),
      templateRow(nationalIds.bulkSecond, "สมหญิง", "แถวสอง", "HN-002"),
      templateRow(nationalIds.bulkConflict, "สมชาย", "ผู้ป่วย", "HN-NEW"),
      templateRow("123", "ข้อมูล", "ไม่ถูกต้อง", ""),
    ]);
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
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.bulkRevalidation, "สมชาย", "ตรวจซ้ำ", "HN-NEW"),
    ]);
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
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.osm, "อสม.", "ทดสอบ", ""),
    ]);

    await expect(previewPatientProvisioning(actor, hospital.id, candidates)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(importPatientProvisioning(actor, hospital.id, candidates)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let a multi-role actor fall back to OSM scope after Hospital bulk scope is revoked", async () => {
    const hospital = await createHospital("PATIENT-MULTI-ROLE-BULK");
    const { actor, userId } = await createMultiRoleHospitalOsmActor(hospital.id);
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.multiRoleBulk, "หลายบทบาท", "ทดสอบ", ""),
    ]);
    const database = createDatabaseThatRevokesHospitalBulkScope(userId, hospital.id);

    await expect(
      importPatientProvisioning(actor, hospital.id, candidates, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      await prisma.osmHospitalRelationship.findFirst({ where: { userId, hospitalId: hospital.id, status: { not: "ENDED" } },
        select: { status: true },
      }),
    ).toEqual({ status: MembershipStatus.ACTIVE });
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });
});
