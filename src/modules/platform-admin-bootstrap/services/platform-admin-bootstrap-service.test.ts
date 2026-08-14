import { Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  PasswordAuthProvisioningReconciliationError,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import {
  ConflictError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import {
  bootstrapPlatformAdmin,
  PlatformAdminBootstrapReconciliationError,
  type PlatformAdminBootstrapDatabase,
} from "./platform-admin-bootstrap-service";

const personId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const providerSubject = "33333333-3333-4333-8333-333333333333";

const validInput = {
  nationalId: "DEMI-ADMIN-ROOT",
  givenName: "สมชาย",
  familyName: "ใจดี",
  password: "correct-horse-battery-staple",
};

type DatabaseOptions = {
  existingAdmin?: boolean;
  existingPerson?: boolean;
  finalAdmin?: boolean;
  userStatus?: UserStatus;
  finalTransactionError?: Error;
  compensationDeleteCount?: number;
};

function createDatabase(options: DatabaseOptions = {}): {
  database: PlatformAdminBootstrapDatabase;
  transaction: {
    person: {
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    user: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    userRole: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    auditEvent: {
      create: ReturnType<typeof vi.fn>;
    };
  };
} {
  const userStatus = options.userStatus ?? UserStatus.PROVISIONED;
  const user = {
    personId,
    authSubject: providerSubject,
    status: userStatus,
    roles: [],
    memberships: [],
  };

  const transaction = {
    person: {
      create: vi.fn().mockResolvedValue({ id: personId }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      create: vi.fn().mockResolvedValue({ id: userId }),
      findUnique: vi.fn().mockResolvedValue(user),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi
        .fn()
        .mockResolvedValue({ count: options.compensationDeleteCount ?? 1 }),
    },
    userRole: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.finalAdmin ? { userId: "44444444-4444-4444-8444-444444444444" } : null),
      create: vi.fn().mockResolvedValue({ userId, role: Role.ADMIN }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  let transactionCount = 0;
  const database = {
    userRole: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options.existingAdmin
            ? { userId: "55555555-5555-4555-8555-555555555555" }
            : null,
        ),
    },
    person: {
      findUnique: vi.fn().mockResolvedValue(options.existingPerson ? { id: personId } : null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
    $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => {
      transactionCount += 1;

      if (transactionCount === 2 && options.finalTransactionError) {
        throw options.finalTransactionError;
      }

      return callback(transaction);
    }),
  } as unknown as PlatformAdminBootstrapDatabase;

  return { database, transaction };
}

function createProvisioner(
  result: ProvisionPasswordAuthIdentityResult = { userId, authSubject: providerSubject },
) {
  return vi.fn().mockResolvedValue(result);
}

describe("platform admin bootstrap application service", () => {
  it("creates the first ACTIVE ADMIN without hospital authority", async () => {
    const { database, transaction } = createDatabase();
    const provisionIdentity = createProvisioner();

    await expect(
      bootstrapPlatformAdmin(validInput, { database, provisionIdentity }),
    ).resolves.toEqual({ userId });

    expect(transaction.person.create).toHaveBeenCalledWith({
      data: {
        identityKeyHash: expect.any(String),
        givenName: validInput.givenName,
        familyName: validInput.familyName,
      },
      select: { id: true },
    });
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: { personId, status: UserStatus.PROVISIONED },
      select: { id: true },
    });
    expect(provisionIdentity).toHaveBeenCalledWith({
      userId,
      password: validInput.password,
    });
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: userId,
        personId,
        status: UserStatus.PROVISIONED,
        authSubject: providerSubject,
      },
      data: { status: UserStatus.ACTIVE },
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: { userId, role: Role.ADMIN },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorUserId: null,
        action: "platform_admin.bootstrapped",
        resourceType: "User",
        resourceId: userId,
        metadata: { role: Role.ADMIN, source: "trusted_cli" },
      },
    });
    expect(JSON.stringify(provisionIdentity.mock.calls)).not.toContain(validInput.nationalId);
    expect(JSON.stringify(transaction.auditEvent.create.mock.calls)).not.toContain(
      validInput.nationalId,
    );
  });

  it("refuses to create a second Platform ADMIN before creating identity", async () => {
    const { database, transaction } = createDatabase({ existingAdmin: true });
    const provisionIdentity = createProvisioner();

    await expect(
      bootstrapPlatformAdmin(validInput, { database, provisionIdentity }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A Platform ADMIN already exists; first-admin bootstrap is no longer available",
    });

    expect(database.person.findUnique).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(provisionIdentity).not.toHaveBeenCalled();
    expect(transaction.userRole.create).not.toHaveBeenCalled();
  });

  it("fails closed for an existing Person/User identity", async () => {
    const { database } = createDatabase({ existingPerson: true });
    const provisionIdentity = createProvisioner();

    await expect(
      bootstrapPlatformAdmin(validInput, { database, provisionIdentity }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(database.$transaction).not.toHaveBeenCalled();
    expect(provisionIdentity).not.toHaveBeenCalled();
  });

  it("rejects a blank or oversized admin identifier before database or provider work", async () => {
    const { database } = createDatabase();
    const provisionIdentity = createProvisioner();

    await expect(
      bootstrapPlatformAdmin(
        { ...validInput, nationalId: " ".repeat(33) },
        { database, provisionIdentity },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(database.userRole.findFirst).not.toHaveBeenCalled();
    expect(database.person.findUnique).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(provisionIdentity).not.toHaveBeenCalled();
  });

  it("cleans up the new local identity when provider provisioning fails", async () => {
    const { database, transaction } = createDatabase();
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new InfrastructureError("provider unavailable"));

    await expect(
      bootstrapPlatformAdmin(validInput, { database, provisionIdentity }),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.user.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: userId,
        personId,
        authSubject: null,
        status: UserStatus.PROVISIONED,
      }),
    });
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("preserves reconciliation-required local state after provider reconciliation failure", async () => {
    const { database } = createDatabase();
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new PasswordAuthProvisioningReconciliationError());

    await expect(
      bootstrapPlatformAdmin(validInput, { database, provisionIdentity }),
    ).rejects.toBeInstanceOf(PasswordAuthProvisioningReconciliationError);

    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(provisionIdentity).toHaveBeenCalledOnce();
  });

  it("compensates provider and local identity when final authority persistence fails", async () => {
    const { database, transaction } = createDatabase({
      finalTransactionError: new Error("database unavailable"),
    });
    const provisionIdentity = createProvisioner();
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      bootstrapPlatformAdmin(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    expect(database.$transaction).toHaveBeenCalledTimes(3);
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("surfaces reconciliation when final compensation cannot prove local ownership", async () => {
    const { database } = createDatabase({
      compensationDeleteCount: 0,
      finalTransactionError: new Error("database unavailable"),
    });
    const provisionIdentity = createProvisioner();
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      bootstrapPlatformAdmin(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toBeInstanceOf(PlatformAdminBootstrapReconciliationError);
  });

  it("surfaces reconciliation when provider compensation fails", async () => {
    const { database, transaction } = createDatabase({
      finalTransactionError: new Error("database unavailable"),
    });
    const provisionIdentity = createProvisioner();
    const deleteProviderIdentity = vi
      .fn()
      .mockRejectedValue(new InfrastructureError("provider unavailable"));

    await expect(
      bootstrapPlatformAdmin(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toBeInstanceOf(PlatformAdminBootstrapReconciliationError);

    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    expect(transaction.user.deleteMany).not.toHaveBeenCalled();
  });

  it("fails closed when the target User is no longer PROVISIONED", async () => {
    const { database, transaction } = createDatabase({
      userStatus: UserStatus.ACTIVE,
      compensationDeleteCount: 0,
    });
    const provisionIdentity = createProvisioner();
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      bootstrapPlatformAdmin(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      requiresReconciliation: true,
    });

    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("compensates a stale final admin check won by another process", async () => {
    const { database, transaction } = createDatabase({ finalAdmin: true });
    const provisionIdentity = createProvisioner();
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);

    await expect(
      bootstrapPlatformAdmin(validInput, {
        database,
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });
});
