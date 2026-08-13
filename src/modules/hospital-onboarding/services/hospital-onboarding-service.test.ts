import { HospitalStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { InfrastructureError } from "@/shared/errors/application-error";

import {
  submitHospitalOnboarding,
  type HospitalOnboardingDatabase,
} from "./hospital-onboarding-service";

const personId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const applicationId = "33333333-3333-4333-8333-333333333333";
const hospitalId = "44444444-4444-4444-8444-444444444444";
const providerSubject = "55555555-5555-4555-8555-555555555555";

function createDatabase(overrides: {
  existingPerson?: boolean;
  existingApplication?: boolean;
  applicationCreate?: () => Promise<{ id: string }>;
} = {}): HospitalOnboardingDatabase {
  const transaction = {
    person: {
      create: vi.fn().mockResolvedValue({ id: personId }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      create: vi.fn().mockResolvedValue({ id: userId }),
      findUnique: vi.fn().mockResolvedValue({
        authSubject: providerSubject,
        status: "PROVISIONED",
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    hospitalOnboardingApplication: {
      create: overrides.applicationCreate ?? vi.fn().mockResolvedValue({ id: applicationId }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    hospital: {
      findUnique: vi.fn().mockResolvedValue({ id: hospitalId, status: HospitalStatus.PENDING_VERIFICATION }),
    },
    hospitalOnboardingApplication: {
      findFirst: vi
        .fn()
        .mockResolvedValue(overrides.existingApplication ? { id: applicationId } : null),
    },
    person: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingPerson ? { id: personId } : null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ authSubject: providerSubject, status: "PROVISIONED" }),
    },
    $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as HospitalOnboardingDatabase;
}

const validInput = {
  hospitalCode: "KANG",
  nationalId: "1000000000009",
  givenName: "สมชาย",
  familyName: "ใจดี",
  password: "correct-horse-battery-staple",
  passwordConfirmation: "correct-horse-battery-staple",
};

describe("hospital onboarding application service", () => {
  it("creates a new provisioned applicant and pending application without granting authority", async () => {
    const database = createDatabase();
    const provisionIdentity = vi.fn().mockResolvedValue({ userId, authSubject: providerSubject });

    await expect(
      submitHospitalOnboarding(validInput, { database, provisionIdentity }),
    ).resolves.toEqual({ applicationId, applicantUserId: userId });

    expect(provisionIdentity).toHaveBeenCalledWith({
      userId,
      password: validInput.password,
    });
    expect(database.hospitalOnboardingApplication.findFirst).toHaveBeenCalledWith({
      where: { hospitalId },
      select: { id: true },
    });
  });

  it("fails closed for an existing identity without creating another account", async () => {
    const database = createDatabase({ existingPerson: true });
    const provisionIdentity = vi.fn();

    await expect(
      submitHospitalOnboarding(validInput, { database, provisionIdentity }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provisionIdentity).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("compensates the new Person/User when provider provisioning fails", async () => {
    const database = createDatabase();
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new InfrastructureError("provider unavailable"));

    await expect(
      submitHospitalOnboarding(validInput, { database, provisionIdentity }),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(database.$transaction).toHaveBeenCalledTimes(2);
  });

  it("compensates provider and new identity when application persistence fails", async () => {
    const database = createDatabase({
      applicationCreate: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });
    const provisionIdentity = vi.fn().mockResolvedValue({ userId, authSubject: providerSubject });
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      submitHospitalOnboarding(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    expect(database.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not allow a second pending application for a hospital", async () => {
    const database = createDatabase({ existingApplication: true });

    await expect(submitHospitalOnboarding(validInput, { database })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
