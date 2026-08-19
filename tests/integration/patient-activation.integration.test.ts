import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PasswordAuthProvisioningProviderRejectedError,
  PasswordAuthProvisioningReconciliationError,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import {
  completePatientActivation,
  issuePatientActivation,
  PatientActivationReconciliationError,
} from "@/modules/patient-activation/services/patient-activation-service";
import {
  hashPatientActivationToken,
} from "@/modules/patient-activation/services/activation-token-service";
import { findPatientActivationCandidates } from "@/modules/patient-activation/services/patient-activation-query-service";

const prisma = getPrisma();
const password = "patient-activation-password";

let sequence = 0;

async function clearDatabase(): Promise<void> {
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

async function createHospitalActor(input: {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  userStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  membershipType?: MembershipType;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `patient-activation-actor-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      status: input.userStatus ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  const membershipType = input.membershipType ?? MembershipType.MEMBER;

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
          hospitalStatus: input.hospitalStatus,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createPatient(input: {
  hospitalId: string;
  status?: UserStatus;
  authSubject?: string | null;
  extraRoles?: Role[];
  identity?: { namespace: string; value: string };
  hospitalNumber?: string | null;
  givenName?: string;
  familyName?: string;
}): Promise<{
  userId: string;
  patientProfileId: string;
  relationshipId: string;
  personId: string;
}> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: input.identity
        ? hashIdentityReference(input.identity)
        : `patient-activation-target-${sequence}`,
      givenName: input.givenName ?? "สมชาย",
      familyName: input.familyName ?? "ผู้ป่วย",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      status: input.status ?? UserStatus.PROVISIONED,
      authSubject:
        input.authSubject === undefined
          ? input.status === UserStatus.ACTIVE
            ? "11111111-1111-4111-8111-111111111111"
            : null
          : input.authSubject,
    },
    select: { id: true },
  });

  await prisma.userRole.createMany({
    data: [Role.PATIENT, ...(input.extraRoles ?? [])].map((role) => ({
      userId: user.id,
      role,
    })),
  });
  const profile = await prisma.patientProfile.create({
    data: { personId: person.id },
    select: { id: true },
  });
  const relationship = await prisma.patientHospitalRelationship.create({
    data: {
      patientProfileId: profile.id,
      hospitalId: input.hospitalId,
      hospitalNumber: input.hospitalNumber ?? null,
    },
    select: { id: true },
  });

  return {
    userId: user.id,
    patientProfileId: profile.id,
    relationshipId: relationship.id,
    personId: person.id,
  };
}

function credentialGenerator(token: string) {
  return () => ({
    plaintextToken: token,
    tokenHash: hashPatientActivationToken(token),
  });
}

function createProvisioner(authSubject: string) {
  return vi.fn(async ({ userId, password: receivedPassword }: { userId: string; password: string }) => {
    expect(receivedPassword).toBe(password);
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  });
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe("Phase 5B.2 patient activation PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows an active direct Hospital actor to issue a hashed one-time activation", async () => {
    const hospital = await createHospital("INTEGRATION-PA");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-issued-token";

    const result = await issuePatientActivation(
      actor,
      {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: false,
      },
      { generateCredential: credentialGenerator(token) },
    );

    expect(result).toMatchObject({
      outcome: "ISSUED",
      userId: patient.userId,
      hospitalId: hospital.id,
      activationToken: token,
    });
    const activation = await prisma.patientActivation.findFirst({
      where: { userId: patient.userId },
      select: { tokenHash: true, usedAt: true, revokedAt: true, hospitalId: true },
    });
    expect(activation).toEqual({
      tokenHash: hashPatientActivationToken(token),
      usedAt: null,
      revokedAt: null,
      hospitalId: hospital.id,
    });
    const audit = await prisma.auditEvent.findMany({
      where: { action: "patient_activation.issued" },
      select: { metadata: true },
    });
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain(hashPatientActivationToken(token));
  });

  it.each([
    ["unrelated Hospital", "unrelated"],
    ["inactive actor", "inactive-actor"],
    ["inactive membership", "inactive-membership"],
    ["inactive Hospital", "inactive-hospital"],
  ])("denies issuance for an %s", async (_label, scenario) => {
    const targetHospital = await createHospital(
      "INTEGRATION-PA-TARGET",
      scenario === "inactive-hospital" ? HospitalStatus.SUSPENDED : HospitalStatus.ACTIVE,
    );
    const otherHospital = await createHospital(
      "INTEGRATION-PA-OTHER",
      scenario === "inactive-hospital" ? HospitalStatus.SUSPENDED : HospitalStatus.ACTIVE,
    );
    const actorHospitalId = scenario === "unrelated" ? otherHospital.id : targetHospital.id;
    const actor = await createHospitalActor({
      hospitalId: actorHospitalId,
      hospitalStatus:
        scenario === "inactive-hospital" ? targetHospital.status : otherHospital.status,
      userStatus: scenario === "inactive-actor" ? UserStatus.SUSPENDED : UserStatus.ACTIVE,
      membershipStatus:
        scenario === "inactive-membership" ? MembershipStatus.SUSPENDED : MembershipStatus.ACTIVE,
    });
    const patient = await createPatient({ hospitalId: targetHospital.id });

    await expect(
      issuePatientActivation(actor.actor, {
        userId: patient.userId,
        targetHospitalId: targetHospital.id,
        reissue: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(prisma.patientActivation.count()).resolves.toBe(0);
  });

  it("denies a Patient without a relationship to the issuing Hospital", async () => {
    const hospital = await createHospital("INTEGRATION-PA-ACTOR");
    const otherHospital = await createHospital("INTEGRATION-PA-PATIENT");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: otherHospital.id });

    await expect(
      issuePatientActivation(actor, {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns activation-not-required for an ACTIVE mapped Patient without creating a credential", async () => {
    const hospital = await createHospital("INTEGRATION-PA-ACTIVE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({
      hospitalId: hospital.id,
      status: UserStatus.ACTIVE,
      authSubject: "22222222-2222-4222-8222-222222222222",
      extraRoles: [Role.OSM],
    });

    await expect(
      issuePatientActivation(actor, {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: true,
      }),
    ).resolves.toMatchObject({ outcome: "ALREADY_ACTIVE", activationToken: null });
    await expect(prisma.patientActivation.count()).resolves.toBe(0);
    await expect(
      prisma.userRole.findMany({ where: { userId: patient.userId }, select: { role: true } }),
    ).resolves.toEqual(expect.arrayContaining([{ role: Role.OSM }, { role: Role.PATIENT }]));
  });

  it("fails closed for a PROVISIONED User with a provider mapping", async () => {
    const hospital = await createHospital("INTEGRATION-PA-CONFLICT");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({
      hospitalId: hospital.id,
      status: UserStatus.PROVISIONED,
      authSubject: "33333333-3333-4333-8333-333333333333",
    });

    await expect(
      issuePatientActivation(actor, {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: false,
      }),
    ).resolves.toMatchObject({ outcome: "RECONCILIATION_REQUIRED", activationToken: null });
    await expect(prisma.patientActivation.count()).resolves.toBe(0);
  });

  it("fails closed for an invalid PROVISIONED auth mapping", async () => {
    const hospital = await createHospital("INTEGRATION-PA-CONFLICT-INVALID");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({
      hospitalId: hospital.id,
      status: UserStatus.PROVISIONED,
      authSubject: "",
    });

    await expect(
      issuePatientActivation(actor, {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reissue revokes the old token and only the new token can complete", async () => {
    const hospital = await createHospital("INTEGRATION-PA-REISSUE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const oldToken = "patient-activation-old-token";
    const newToken = "patient-activation-new-token";

    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(oldToken) },
    );
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: true },
      { generateCredential: credentialGenerator(newToken) },
    );

    await expect(
      completePatientActivation(oldToken, {
        password,
        passwordConfirmation: password,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.patientActivation.findFirst({
        where: { tokenHash: hashPatientActivationToken(oldToken) },
        select: { revokedAt: true },
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });

    const provisioner = createProvisioner("44444444-4444-4444-8444-444444444444");
    await expect(
      completePatientActivation(
        newToken,
        { password, passwordConfirmation: password },
        { provisionIdentity: provisioner },
      ),
    ).resolves.toEqual({ userId: patient.userId, hospitalId: hospital.id });
    expect(provisioner).toHaveBeenCalledOnce();
  });

  it.each([
    ["expired", { expiresAt: new Date("2020-01-01T00:00:00.000Z") }],
    ["revoked", { revokedAt: new Date("2026-08-15T00:00:00.000Z") }],
    ["used", { usedAt: new Date("2026-08-15T00:00:00.000Z") }],
  ])("denies a %s activation and an unknown token", async (_label, update) => {
    const hospital = await createHospital("INTEGRATION-PA-INVALID");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-invalid-token";

    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    await prisma.patientActivation.updateMany({
      where: { userId: patient.userId },
      data: update,
    });

    await expect(
      completePatientActivation(token, {
        password,
        passwordConfirmation: password,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      completePatientActivation("patient-activation-unknown-token", {
        password,
        passwordConfirmation: password,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("completes activation without changing PatientProfile, relationship, or roles", async () => {
    const hospital = await createHospital("INTEGRATION-PA-COMPLETE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id, extraRoles: [Role.OSM] });
    const token = "patient-activation-complete-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const beforeProfile = await prisma.patientProfile.findUniqueOrThrow({
      where: { id: patient.patientProfileId },
      select: { personId: true, createdAt: true, updatedAt: true },
    });
    const beforeRelationship = await prisma.patientHospitalRelationship.findUniqueOrThrow({
      where: { id: patient.relationshipId },
      select: { patientProfileId: true, hospitalId: true, hospitalNumber: true, createdAt: true, updatedAt: true },
    });
    const provisioner = createProvisioner("66666666-6666-4666-8666-666666666666");

    await completePatientActivation(
      token,
      { password, passwordConfirmation: password },
      { provisionIdentity: provisioner },
    );

    await expect(
      prisma.user.findUnique({
        where: { id: patient.userId },
        select: { status: true, authSubject: true, roles: { select: { role: true } } },
      }),
    ).resolves.toEqual({
      status: UserStatus.ACTIVE,
      authSubject: "66666666-6666-4666-8666-666666666666",
      roles: expect.arrayContaining([{ role: Role.OSM }, { role: Role.PATIENT }]),
    });
    await expect(
      prisma.patientProfile.findUnique({
        where: { id: patient.patientProfileId },
        select: { personId: true, createdAt: true, updatedAt: true },
      }),
    ).resolves.toEqual(beforeProfile);
    await expect(
      prisma.patientHospitalRelationship.findUnique({
        where: { id: patient.relationshipId },
        select: { patientProfileId: true, hospitalId: true, hospitalNumber: true, createdAt: true, updatedAt: true },
      }),
    ).resolves.toEqual(beforeRelationship);
    await expect(
      prisma.patientActivation.findFirst({
        where: { userId: patient.userId },
        select: { usedAt: true, revokedAt: true },
      }),
    ).resolves.toMatchObject({ usedAt: expect.any(Date), revokedAt: null });
    await expect(prisma.auditEvent.count({ where: { action: "patient_activation.completed" } })).resolves.toBe(1);
    const localState = await Promise.all([
      prisma.user.findUnique({ where: { id: patient.userId }, select: { status: true, authSubject: true } }),
      prisma.person.findUnique({ where: { id: patient.personId }, select: { givenName: true, familyName: true } }),
      prisma.auditEvent.findMany({ where: { action: "patient_activation.completed" }, select: { metadata: true } }),
    ]);
    expect(JSON.stringify(localState)).not.toContain(password);
  });

  it("releases the claim when provider creation fails so a retry remains safe", async () => {
    const hospital = await createHospital("INTEGRATION-PA-PROVIDER-FAIL");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-provider-fail-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const provisioner = vi.fn(async () => {
      throw new PasswordAuthProvisioningProviderRejectedError();
    });

    await expect(
      completePatientActivation(
        token,
        { password, passwordConfirmation: password },
        { provisionIdentity: provisioner },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    await expect(
      prisma.user.findUnique({ where: { id: patient.userId }, select: { status: true, authSubject: true } }),
    ).resolves.toEqual({ status: UserStatus.PROVISIONED, authSubject: null });
    await expect(
        prisma.patientActivation.findFirst({
          where: { userId: patient.userId },
          select: { claimedAt: true, claimExpiresAt: true, reconciliationRequiredAt: true, usedAt: true },
        }),
    ).resolves.toEqual({
      claimedAt: null,
      claimExpiresAt: null,
      reconciliationRequiredAt: null,
      usedAt: null,
    });
  });

  it("compensates provider success when local finalization fails", async () => {
    const hospital = await createHospital("INTEGRATION-PA-COMPENSATE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-compensate-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const providerSubject = "77777777-7777-4777-8777-777777777777";
    const provisioner = vi.fn(async ({ userId, password: receivedPassword }: { userId: string; password: string }) => {
      expect(receivedPassword).toBe(password);
      await prisma.user.update({ where: { id: userId }, data: { authSubject: providerSubject } });
      await prisma.patientHospitalRelationship.delete({ where: { id: patient.relationshipId } });
      return { userId, authSubject: providerSubject };
    });
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      completePatientActivation(
        token,
        { password, passwordConfirmation: password },
        { provisionIdentity: provisioner, deleteProviderIdentity },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    await expect(
      prisma.user.findUnique({ where: { id: patient.userId }, select: { status: true, authSubject: true } }),
    ).resolves.toEqual({ status: UserStatus.PROVISIONED, authSubject: null });
    await expect(
      prisma.patientActivation.findFirst({ where: { userId: patient.userId }, select: { claimedAt: true, usedAt: true } }),
    ).resolves.toEqual({ claimedAt: null, usedAt: null });
  });

  it("keeps a bounded claim lease while provider provisioning is in progress", async () => {
    const hospital = await createHospital("INTEGRATION-PA-LEASE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-lease-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );

    const started = createDeferred();
    const release = createDeferred();
    const provisioner = vi.fn(async ({ userId }: { userId: string }) => {
      started.resolve();
      await release.promise;
      await prisma.user.update({
        where: { id: userId },
        data: { authSubject: "99999999-9999-4999-8999-999999999999" },
      });
      return { userId, authSubject: "99999999-9999-4999-8999-999999999999" };
    });

    const completion = completePatientActivation(
      token,
      { password, passwordConfirmation: password },
      { provisionIdentity: provisioner },
    );
    await started.promise;

    const claimed = await prisma.patientActivation.findFirstOrThrow({
      where: { userId: patient.userId },
      select: { claimedAt: true, claimExpiresAt: true, usedAt: true },
    });
    expect(claimed.claimedAt).toEqual(expect.any(Date));
    expect(claimed.claimExpiresAt).toEqual(expect.any(Date));
    expect(claimed.claimExpiresAt!.getTime()).toBeGreaterThan(claimed.claimedAt!.getTime());
    expect(claimed.usedAt).toBeNull();

    release.resolve();
    await expect(completion).resolves.toEqual({ userId: patient.userId, hospitalId: hospital.id });
  });

  it("recovers a stale clean claim and lets the Patient retry", async () => {
    const hospital = await createHospital("INTEGRATION-PA-STALE-CLEAN");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-stale-clean-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const claimedAt = new Date("2026-08-15T10:00:00.000Z");
    await prisma.patientActivation.updateMany({
      where: { userId: patient.userId },
      data: {
        claimedAt,
        claimExpiresAt: new Date("2026-08-15T10:05:00.000Z"),
      },
    });

    await expect(
      completePatientActivation(
        token,
        { password, passwordConfirmation: password },
        {
          now: () => new Date("2026-08-15T10:10:00.000Z"),
          provisionIdentity: createProvisioner("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        },
      ),
    ).resolves.toEqual({ userId: patient.userId, hospitalId: hospital.id });
    await expect(
      prisma.auditEvent.count({ where: { action: "patient_activation.stale_claim_released" } }),
    ).resolves.toBe(1);
  });

  it("allows Hospital reissue after a stale clean claim", async () => {
    const hospital = await createHospital("INTEGRATION-PA-STALE-REISSUE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const oldToken = "patient-activation-stale-old-token";
    const newToken = "patient-activation-stale-new-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(oldToken) },
    );
    await prisma.patientActivation.updateMany({
      where: { userId: patient.userId },
      data: {
        claimedAt: new Date("2026-08-15T10:00:00.000Z"),
        claimExpiresAt: new Date("2026-08-15T10:05:00.000Z"),
      },
    });

    await expect(
      issuePatientActivation(
        actor,
        { userId: patient.userId, targetHospitalId: hospital.id, reissue: true },
        {
          now: () => new Date("2026-08-15T10:10:00.000Z"),
          generateCredential: credentialGenerator(newToken),
        },
      ),
    ).resolves.toMatchObject({ outcome: "ISSUED", activationToken: newToken });
    await expect(
      prisma.patientActivation.findFirst({
        where: { tokenHash: hashPatientActivationToken(oldToken) },
        select: { revokedAt: true },
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(
      prisma.patientActivation.count({
        where: { userId: patient.userId, usedAt: null, revokedAt: null },
      }),
    ).resolves.toBe(1);
  });

  it("marks a stale claim with a local authSubject as reconciliation-required", async () => {
    const hospital = await createHospital("INTEGRATION-PA-STALE-UNSAFE");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-stale-unsafe-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    await prisma.patientActivation.updateMany({
      where: { userId: patient.userId },
      data: {
        claimedAt: new Date("2026-08-15T10:00:00.000Z"),
        claimExpiresAt: new Date("2026-08-15T10:05:00.000Z"),
      },
    });
    await prisma.user.update({
      where: { id: patient.userId },
      data: { authSubject: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    });

    await expect(
      issuePatientActivation(
        actor,
        { userId: patient.userId, targetHospitalId: hospital.id, reissue: true },
        { now: () => new Date("2026-08-15T10:10:00.000Z") },
      ),
    ).resolves.toMatchObject({ outcome: "RECONCILIATION_REQUIRED", activationToken: null });
    await expect(
      prisma.patientActivation.findFirst({
        where: { userId: patient.userId },
        select: { reconciliationRequiredAt: true, claimExpiresAt: true },
      }),
    ).resolves.toMatchObject({
      reconciliationRequiredAt: expect.any(Date),
      claimExpiresAt: null,
    });
    await expect(
      completePatientActivation(token, { password, passwordConfirmation: password }),
    ).rejects.toBeInstanceOf(PatientActivationReconciliationError);
  });

  it("keeps an ambiguous provider outcome reserved and blocks normal reissue", async () => {
    const hospital = await createHospital("INTEGRATION-PA-PROV-AMBIG");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-provider-ambiguous-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const provisioner = vi.fn(async () => {
      throw new PasswordAuthProvisioningReconciliationError();
    });

    await expect(
      completePatientActivation(
        token,
        { password, passwordConfirmation: password },
        { provisionIdentity: provisioner },
      ),
    ).rejects.toBeInstanceOf(PatientActivationReconciliationError);
    await expect(
      prisma.patientActivation.findFirst({
        where: { userId: patient.userId },
        select: { claimedAt: true, claimExpiresAt: true, reconciliationRequiredAt: true, usedAt: true },
      }),
    ).resolves.toMatchObject({
      claimedAt: expect.any(Date),
      claimExpiresAt: null,
      reconciliationRequiredAt: expect.any(Date),
      usedAt: null,
    });
    await expect(
      issuePatientActivation(actor, {
        userId: patient.userId,
        targetHospitalId: hospital.id,
        reissue: true,
      }),
    ).resolves.toMatchObject({ outcome: "RECONCILIATION_REQUIRED", activationToken: null });
  });

  it("marks ambiguous compensation as reconciliation-required", async () => {
    const hospital = await createHospital("INTEGRATION-PA-COMP-AMBIG");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-compensate-ambiguous-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const providerSubject = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const provisioner = vi.fn(async ({ userId }: { userId: string }) => {
      await prisma.user.update({ where: { id: userId }, data: { authSubject: providerSubject } });
      await prisma.patientHospitalRelationship.delete({ where: { id: patient.relationshipId } });
      return { userId, authSubject: providerSubject };
    });
    const deleteProviderIdentity = vi.fn(async () => {
      throw new PatientActivationReconciliationError();
    });

    await expect(
      completePatientActivation(
        token,
        { password, passwordConfirmation: password },
        { provisionIdentity: provisioner, deleteProviderIdentity },
      ),
    ).rejects.toBeInstanceOf(PatientActivationReconciliationError);
    await expect(
      prisma.patientActivation.findFirst({
        where: { userId: patient.userId },
        select: { reconciliationRequiredAt: true, usedAt: true },
      }),
    ).resolves.toMatchObject({ reconciliationRequiredAt: expect.any(Date), usedAt: null });
  });

  it("uses a narrow Hospital-scoped activation lookup without exposing identity data", async () => {
    const hospital = await createHospital("INTEGRATION-PA-LOOKUP");
    const unrelatedHospital = await createHospital("INTEGRATION-PA-LOOKUP-OTHER");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const nationalId = "1000000000009";
    const byNationalId = await createPatient({
      hospitalId: hospital.id,
      identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId },
      hospitalNumber: "LOOKUP-001",
      givenName: "สมหญิง",
      familyName: "ใจดี",
    });
    const sameNameInOtherHospital = await createPatient({
      hospitalId: unrelatedHospital.id,
      givenName: "สมหญิง",
      familyName: "ใจดี",
      hospitalNumber: "OTHER-001",
    });
    await createPatient({ hospitalId: hospital.id, hospitalNumber: "LOOKUP-DUP" });
    await createPatient({ hospitalId: hospital.id, hospitalNumber: "LOOKUP-DUP" });

    const firstNameResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "สมหญิง",
    });
    expect(firstNameResults).toHaveLength(1);
    expect(firstNameResults[0]?.userId).toBe(byNationalId.userId);

    const surnameResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "ใจดี",
    });
    expect(surnameResults).toHaveLength(1);
    expect(surnameResults[0]?.userId).toBe(byNationalId.userId);

    const multipleTermResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "สมหญิง ใจดี",
    });
    expect(multipleTermResults).toHaveLength(1);
    expect(multipleTermResults[0]?.userId).toBe(byNationalId.userId);

    const noNameResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "NAME",
      value: "ไม่มีผู้ป่วยชื่อนี้",
    });
    expect(noNameResults).toEqual([]);
    expect(sameNameInOtherHospital.userId).not.toBe(byNationalId.userId);

    const nationalIdResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "NATIONAL_ID",
      value: nationalId,
    });
    expect(nationalIdResults).toHaveLength(1);
    expect(nationalIdResults[0]).toMatchObject({
      userId: byNationalId.userId,
      patientProfileId: byNationalId.patientProfileId,
      hospitalNumber: "LOOKUP-001",
      activationStatus: "NOT_ISSUED",
      activationMayBeIssued: true,
    });
    expect(JSON.stringify(nationalIdResults)).not.toContain(nationalId);
    expect(JSON.stringify(nationalIdResults)).not.toContain("identityKeyHash");

    const hnResults = await findPatientActivationCandidates(actor, {
      targetHospitalId: hospital.id,
      lookupType: "HOSPITAL_NUMBER",
      value: "LOOKUP-DUP",
    });
    expect(hnResults).toHaveLength(2);
    expect(hnResults.every((candidate) => candidate.hospitalNumber === "LOOKUP-DUP")).toBe(true);

    const { actor: unrelatedActor } = await createHospitalActor({
      hospitalId: unrelatedHospital.id,
      hospitalStatus: unrelatedHospital.status,
    });
    await expect(
      findPatientActivationCandidates(unrelatedActor, {
        targetHospitalId: hospital.id,
        lookupType: "HOSPITAL_NUMBER",
        value: "LOOKUP-001",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { actor: inactiveMembershipActor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    await expect(
      findPatientActivationCandidates(inactiveMembershipActor, {
        targetHospitalId: hospital.id,
        lookupType: "HOSPITAL_NUMBER",
        value: "LOOKUP-001",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows only one concurrent claim and calls the provider once", async () => {
    const hospital = await createHospital("INTEGRATION-PA-CONCURRENT");
    const { actor } = await createHospitalActor({
      hospitalId: hospital.id,
      hospitalStatus: hospital.status,
    });
    const patient = await createPatient({ hospitalId: hospital.id });
    const token = "patient-activation-concurrent-token";
    await issuePatientActivation(
      actor,
      { userId: patient.userId, targetHospitalId: hospital.id, reissue: false },
      { generateCredential: credentialGenerator(token) },
    );
    const started = createDeferred();
    const release = createDeferred();
    const provisioner = vi.fn(async ({ userId, password: receivedPassword }: { userId: string; password: string }) => {
      expect(receivedPassword).toBe(password);
      started.resolve();
      await release.promise;
      await prisma.user.update({
        where: { id: userId },
        data: { authSubject: "88888888-8888-4888-8888-888888888888" },
      });
      return { userId, authSubject: "88888888-8888-4888-8888-888888888888" };
    });

    const first = completePatientActivation(
      token,
      { password, passwordConfirmation: password },
      { provisionIdentity: provisioner },
    );
    await started.promise;
    const claimed = await prisma.patientActivation.findFirstOrThrow({
      where: { userId: patient.userId },
      select: { claimedAt: true, claimExpiresAt: true },
    });
    expect(claimed.claimedAt).toEqual(expect.any(Date));
    expect(claimed.claimExpiresAt).toEqual(expect.any(Date));
    const second = completePatientActivation(
      token,
      { password, passwordConfirmation: password },
      { provisionIdentity: provisioner },
    );
    await expect(second).rejects.toMatchObject({ code: "CONFLICT" });
    release.resolve();
    await expect(first).resolves.toEqual({ userId: patient.userId, hospitalId: hospital.id });
    expect(provisioner).toHaveBeenCalledOnce();
  });
});
