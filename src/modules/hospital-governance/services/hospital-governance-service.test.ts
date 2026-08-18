import { HospitalStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

import {
  getHospitalGovernanceDetail,
  listHospitalGovernanceDirectory,
  restoreHospital,
  suspendHospital,
  type HospitalGovernanceProjection,
} from "./hospital-governance-service";

type FakeState = {
  hospitals: HospitalGovernanceProjection[];
  users: Map<string, { status: UserStatus; roles: { role: Role }[] }>;
  audits: unknown[];
};

type FakeDatabase = {
  database: PrismaClient;
  updateMany: ReturnType<typeof vi.fn>;
  auditCreate: ReturnType<typeof vi.fn>;
};

function createActor(userId = "22222222-2222-4222-8222-222222222222"): ActorContext {
  return {
    userId,
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.ADMIN],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

function createHospital(status: HospitalStatus): HospitalGovernanceProjection {
  const updatedAt = new Date("2026-08-18T04:00:00.000Z");

  return {
    id: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "GOV-001",
    name: "โรงพยาบาลกำกับดูแล",
    status,
    createdAt: new Date("2026-08-01T04:00:00.000Z"),
    updatedAt,
  };
}

function createDatabase(state: FakeState): FakeDatabase {
  const updateMany = vi.fn(async (args: { where: { id: string; status: HospitalStatus; updatedAt: Date }; data: { status: HospitalStatus } }) => {
    const hospital = state.hospitals.find((candidate) => candidate.id === args.where.id);

    if (
      !hospital ||
      hospital.status !== args.where.status ||
      hospital.updatedAt.getTime() !== args.where.updatedAt.getTime()
    ) {
      return { count: 0 };
    }

    hospital.status = args.data.status;
    hospital.updatedAt = new Date(hospital.updatedAt.getTime() + 1000);
    return { count: 1 };
  });
  const auditCreate = vi.fn(async (args: { data: unknown }) => {
    state.audits.push(args.data);
    return args.data;
  });
  const transaction = {
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => state.users.get(args.where.id) ?? null),
    },
    hospital: {
      findMany: vi.fn(async () =>
        state.hospitals.filter(
          (candidate) =>
            candidate.status === HospitalStatus.ACTIVE || candidate.status === HospitalStatus.SUSPENDED,
        ),
      ),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return state.hospitals.find((candidate) => candidate.id === args.where.id) ?? null;
      }),
      updateMany,
    },
    auditEvent: { create: auditCreate },
  };
  const database = {
    hospital: transaction.hospital,
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PrismaClient;

  return { database, updateMany, auditCreate };
}

function stateWithHospital(status: HospitalStatus): FakeState {
  const hospital = createHospital(status);

  return {
    hospitals: [hospital],
    users: new Map([
      [
        "22222222-2222-4222-8222-222222222222",
        { status: UserStatus.ACTIVE, roles: [{ role: Role.ADMIN }] },
      ],
    ]),
    audits: [],
  };
}

describe("hospital governance service", () => {
  it("returns only the bounded governance projection and excludes pending Hospitals from the directory", async () => {
    const state = stateWithHospital(HospitalStatus.ACTIVE);
    state.hospitals.push({
      ...createHospital(HospitalStatus.SUSPENDED),
      id: "55555555-5555-4555-8555-555555555555",
      hospitalCode: "SUSPENDED-001",
    });
    state.hospitals.push({ ...createHospital(HospitalStatus.PENDING_VERIFICATION), id: "44444444-4444-4444-8444-444444444444", hospitalCode: "PENDING-001" });
    const fake = createDatabase(state);
    const directory = await listHospitalGovernanceDirectory(createActor(), fake.database);

    expect(directory).toHaveLength(2);
    expect(directory[0]).toMatchObject({ status: HospitalStatus.ACTIVE });
    expect(Object.keys(directory[0] ?? {}).sort()).toEqual([
      "createdAt",
      "hospitalCode",
      "id",
      "name",
      "status",
      "updatedAt",
    ]);
    expect(JSON.stringify(directory)).not.toContain("Patient");

    const pending = await getHospitalGovernanceDetail(
      createActor(),
      "44444444-4444-4444-8444-444444444444",
      fake.database,
    );
    expect(pending.status).toBe(HospitalStatus.PENDING_VERIFICATION);
  });

  it("suspends an exact Hospital and audits the status-only transition", async () => {
    const state = stateWithHospital(HospitalStatus.ACTIVE);
    const fake = createDatabase(state);
    const current = state.hospitals[0];

    if (!current) {
      throw new Error("Test Hospital fixture is missing");
    }

    const result = await suspendHospital(createActor(), {
      hospitalId: current.id,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    }, { database: fake.database });

    expect(result.status).toBe(HospitalStatus.SUSPENDED);
    expect(state.hospitals[0]?.status).toBe(HospitalStatus.SUSPENDED);
    expect(fake.updateMany).toHaveBeenCalledWith({
      where: {
        id: current.id,
        status: HospitalStatus.ACTIVE,
        updatedAt: new Date("2026-08-18T04:00:00.000Z"),
      },
      data: { status: HospitalStatus.SUSPENDED },
    });
    expect(state.audits).toEqual([
      {
        actorUserId: "22222222-2222-4222-8222-222222222222",
        action: "hospital.suspended",
        resourceType: "Hospital",
        resourceId: current.id,
        metadata: {
          fromStatus: HospitalStatus.ACTIVE,
          toStatus: HospitalStatus.SUSPENDED,
        },
      },
    ]);
  });

  it("restores only a suspended Hospital with the exact expected version", async () => {
    const state = stateWithHospital(HospitalStatus.SUSPENDED);
    const fake = createDatabase(state);
    const current = state.hospitals[0];

    if (!current) {
      throw new Error("Test Hospital fixture is missing");
    }

    const result = await restoreHospital(createActor(), {
      hospitalId: current.id,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    }, { database: fake.database });

    expect(result.status).toBe(HospitalStatus.ACTIVE);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "hospital.restored",
      resourceType: "Hospital",
      resourceId: current.id,
      metadata: {
        fromStatus: HospitalStatus.SUSPENDED,
        toStatus: HospitalStatus.ACTIVE,
      },
    });
  });

  it("rejects stale and invalid transitions without a write or success audit", async () => {
    const state = stateWithHospital(HospitalStatus.ACTIVE);
    const fake = createDatabase(state);
    const current = state.hospitals[0];

    if (!current) {
      throw new Error("Test Hospital fixture is missing");
    }

    await expect(
      suspendHospital(createActor(), {
        hospitalId: current.id,
        expectedUpdatedAt: "2026-08-18T03:00:00.000Z",
      }, { database: fake.database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(fake.updateMany).not.toHaveBeenCalled();
    expect(state.audits).toHaveLength(0);

    state.hospitals[0] = createHospital(HospitalStatus.SUSPENDED);
    await expect(
      suspendHospital(createActor(), {
        hospitalId: current.id,
        expectedUpdatedAt: state.hospitals[0].updatedAt.toISOString(),
      }, { database: fake.database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(state.audits).toHaveLength(0);
  });

  it("revalidates the actor User inside the mutation transaction", async () => {
    const state = stateWithHospital(HospitalStatus.ACTIVE);
    const fake = createDatabase(state);
    state.users.set("22222222-2222-4222-8222-222222222222", {
      status: UserStatus.SUSPENDED,
      roles: [{ role: Role.ADMIN }],
    });
    const current = state.hospitals[0];

    if (!current) {
      throw new Error("Test Hospital fixture is missing");
    }

    await expect(
      suspendHospital(createActor(), {
        hospitalId: current.id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
      }, { database: fake.database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(current.status).toBe(HospitalStatus.ACTIVE);
    expect(state.audits).toHaveLength(0);
  });
});
