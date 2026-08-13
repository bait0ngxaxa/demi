import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  HospitalOnboardingApplicationStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";
import {
  approveHospitalOnboarding,
  rejectHospitalOnboarding,
  submitHospitalOnboarding,
} from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { PasswordAuthProvisioningReconciliationError } from "@/modules/auth/services/password-auth-provisioning-service";

const execFileAsync = promisify(execFile);
const prisma = getPrisma();
const seedScript = "scripts/seed-hospital-master.mjs";

const nationalIds = {
  first: "1000000000009",
  second: "1000000000017",
  third: "1000000000025",
  fourth: "1000000000033",
  fifth: "1000000000041",
  sixth: "1000000000050",
};

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function runHospitalMasterSeed(): Promise<void> {
  await execFileAsync(process.execPath, [seedScript], {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function createAdmin(label: string): Promise<{ id: string }> {
  const person = await prisma.person.create({
    data: { identityKeyHash: `integration-admin-${label}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });
  return user;
}

function createProviderProvisioner(authSubject: string) {
  return async ({ userId }: { userId: string; password: string }) => {
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

async function submit(
  hospitalCode: string,
  nationalId: string,
  authSubject: string,
): Promise<{ applicationId: string; applicantUserId: string }> {
  return submitHospitalOnboarding(
    {
      hospitalCode,
      nationalId,
      givenName: "ผู้สมัคร",
      familyName: "ทดสอบ",
      password: "correct-horse-battery-staple",
      passwordConfirmation: "correct-horse-battery-staple",
    },
    { provisionIdentity: createProviderProvisioner(authSubject) },
  );
}

describe("Phase 3B hospital onboarding PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDatabase();
    await runHospitalMasterSeed();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma.$disconnect();
  });

  it("imports exactly 78 canonical hospitals idempotently and preserves active status", async () => {
    await runHospitalMasterSeed();
    await prisma.hospital.update({
      where: { hospitalCode: "KANG" },
      data: { status: HospitalStatus.ACTIVE },
    });
    await runHospitalMasterSeed();

    expect(await prisma.hospital.count()).toBe(78);
    expect(await prisma.hospital.count({ where: { hospitalCode: "HH" } })).toBe(0);
    expect(
      await prisma.hospital.findUnique({
        where: { hospitalCode: "KANG" },
        select: { name: true, status: true },
      }),
    ).toEqual({ name: "โรงพยาบาลแก่งคอย", status: HospitalStatus.ACTIVE });
    expect(
      await prisma.hospital.findUnique({
        where: { hospitalCode: "KHON" },
        select: { name: true },
      }),
    ).toEqual({ name: "โรงพยาบาลขอนแก่น" });
    expect(await prisma.hospital.count({ where: { parentHospitalId: { not: null } } })).toBe(35);
  });

  it("creates a provisioned applicant and pending application without authority", async () => {
    const result = await submit("KANG", nationalIds.first, "66666666-6666-4666-8666-666666666666");
    const user = await prisma.user.findUnique({
      where: { id: result.applicantUserId },
      select: { status: true, authSubject: true, roles: true, memberships: true },
    });
    const application = await prisma.hospitalOnboardingApplication.findUnique({
      where: { id: result.applicationId },
      select: { status: true, hospital: { select: { status: true } } },
    });

    expect(user?.status).toBe(UserStatus.PROVISIONED);
    expect(user?.authSubject).toBe("66666666-6666-4666-8666-666666666666");
    expect(user?.roles).toHaveLength(0);
    expect(user?.memberships).toHaveLength(0);
    expect(application).toEqual({
      status: HospitalOnboardingApplicationStatus.PENDING,
      hospital: { status: HospitalStatus.PENDING_VERIFICATION },
    });

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "hospital_onboarding.submitted" },
      select: { metadata: true },
    });
    const auditText = JSON.stringify(audit?.metadata);
    expect(auditText).not.toContain(nationalIds.first);
    expect(auditText).not.toContain("correct-horse-battery-staple");
  });

  it("approves atomically into active hospital owner access without ADMIN", async () => {
    const result = await submit("KANG", nationalIds.second, "77777777-7777-4777-8777-777777777777");
    const admin = await createAdmin("approve");

    await expect(
      approveHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: admin.id }),
    ).resolves.toEqual({ applicationId: result.applicationId });

    const user = await prisma.user.findUnique({
      where: { id: result.applicantUserId },
      select: { status: true, roles: { select: { role: true } }, memberships: true },
    });
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalCode: "KANG" },
      select: { status: true },
    });
    const application = await prisma.hospitalOnboardingApplication.findUnique({
      where: { id: result.applicationId },
      select: { status: true, reviewedByUserId: true, reviewedAt: true },
    });

    expect(user?.status).toBe(UserStatus.ACTIVE);
    expect(user?.roles.map(({ role }) => role)).toEqual([Role.HOSPITAL]);
    expect(user?.memberships).toEqual([
      expect.objectContaining({
        hospitalId: expect.any(String),
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    expect(hospital?.status).toBe(HospitalStatus.ACTIVE);
    expect(application?.status).toBe(HospitalOnboardingApplicationStatus.APPROVED);
    expect(application?.reviewedByUserId).toBe(admin.id);
    expect(application?.reviewedAt).toBeInstanceOf(Date);
    expect(
      await prisma.auditEvent.count({ where: { action: "hospital_onboarding.approved" } }),
    ).toBe(1);
    expect(
      await prisma.userRole.count({ where: { userId: result.applicantUserId, role: Role.ADMIN } }),
    ).toBe(0);
  });

  it("rejects without activation, role, or membership and remains repeat-safe", async () => {
    const result = await submit("KHON", nationalIds.third, "88888888-8888-4888-8888-888888888888");
    const admin = await createAdmin("reject");

    await expect(
      rejectHospitalOnboarding({
        applicationId: result.applicationId,
        reviewerUserId: admin.id,
        rejectionReason: "ข้อมูลยังไม่เพียงพอ",
      }),
    ).resolves.toEqual({ applicationId: result.applicationId });

    await expect(
      rejectHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: admin.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      approveHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: admin.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const user = await prisma.user.findUnique({
      where: { id: result.applicantUserId },
      select: { status: true, roles: true, memberships: true },
    });
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalCode: "KHON" },
      select: { status: true },
    });
    const application = await prisma.hospitalOnboardingApplication.findUnique({
      where: { id: result.applicationId },
      select: { status: true, rejectionReason: true },
    });

    expect(user?.status).toBe(UserStatus.PROVISIONED);
    expect(user?.roles).toHaveLength(0);
    expect(user?.memberships).toHaveLength(0);
    expect(hospital?.status).toBe(HospitalStatus.PENDING_VERIFICATION);
    expect(application).toEqual({
      status: HospitalOnboardingApplicationStatus.REJECTED,
      rejectionReason: "ข้อมูลยังไม่เพียงพอ",
    });
  });

  it("denies duplicate identity and duplicate pending hospital claims", async () => {
    await submit("KANG", nationalIds.fourth, "99999999-9999-4999-8999-999999999999");
    await expect(
      submit("KHON", nationalIds.fourth, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      submit("KANG", nationalIds.fifth, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.hospitalOnboardingApplication.count()).toBe(1);
  });

  it("rejects unknown and already active hospitals", async () => {
    await expect(
      submit("NOT-A-HOSPITAL", nationalIds.sixth, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const result = await submit("KANG", nationalIds.sixth, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const admin = await createAdmin("active");
    await approveHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: admin.id });

    await expect(
      submit("KANG", "1000000000068", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("compensates newly-created identity when provider provisioning fails", async () => {
    await expect(
      submitHospitalOnboarding(
        {
          hospitalCode: "KANG",
          nationalId: "1000000000076",
          givenName: "ผู้สมัคร",
          familyName: "ล้มเหลว",
          password: "correct-horse-battery-staple",
          passwordConfirmation: "correct-horse-battery-staple",
        },
        {
          provisionIdentity: async () => {
            throw new InfrastructureError("provider unavailable");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.hospitalOnboardingApplication.count()).toBe(0);
  });

  it("surfaces provider reconciliation and leaves no approvable application", async () => {
    await expect(
      submitHospitalOnboarding(
        {
          hospitalCode: "KANG",
          nationalId: "1000000000084",
          givenName: "ผู้สมัคร",
          familyName: "ต้องตรวจสอบ",
          password: "correct-horse-battery-staple",
          passwordConfirmation: "correct-horse-battery-staple",
        },
        {
          provisionIdentity: async () => {
            throw new PasswordAuthProvisioningReconciliationError();
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(await prisma.hospitalOnboardingApplication.count()).toBe(0);
    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.user.count({ where: { status: UserStatus.PROVISIONED } })).toBe(1);
  });

  it("rolls back approval state when applicant preconditions are inconsistent", async () => {
    const result = await submit("KANG", "1000000000092", "ffffffff-ffff-4fff-8fff-ffffffffffff");
    const admin = await createAdmin("rollback");
    await prisma.user.update({ where: { id: result.applicantUserId }, data: { status: UserStatus.SUSPENDED } });

    await expect(
      approveHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: admin.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const application = await prisma.hospitalOnboardingApplication.findUnique({
      where: { id: result.applicationId },
      select: { status: true },
    });
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalCode: "KANG" },
      select: { status: true },
    });
    const membershipCount = await prisma.hospitalMembership.count({
      where: { userId: result.applicantUserId },
    });

    expect(application?.status).toBe(HospitalOnboardingApplicationStatus.PENDING);
    expect(hospital?.status).toBe(HospitalStatus.PENDING_VERIFICATION);
    expect(membershipCount).toBe(0);
  });

  it("denies review to a hospital owner who is not a Platform ADMIN", async () => {
    const result = await submit("KANG", "1000000000106", "12121212-1212-4121-8121-121212121212");
    const person = await prisma.person.create({ data: { identityKeyHash: "integration-owner" } });
    const owner = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: owner.id, role: Role.HOSPITAL } });

    await expect(
      approveHospitalOnboarding({ applicationId: result.applicationId, reviewerUserId: owner.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
