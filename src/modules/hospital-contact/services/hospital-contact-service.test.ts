import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

const { recordAuditEvent } = vi.hoisted(() => ({ recordAuditEvent: vi.fn() }));

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent }));

import {
  hospitalContactServiceInternals,
  listEligibleHospitalContactOwnerHospitals,
  listOwnPatientHospitalContacts,
  readHospitalContactForOwner,
  readOwnPatientHospitalContact,
  updateHospitalContact,
  type HospitalContactDatabase,
} from "./hospital-contact-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const hospitalContactId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const relationshipId = "55555555-5555-4555-8555-555555555555";
const version = new Date("2026-10-05T02:03:04.005Z");

function ownerActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId,
    personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: "DOCTOR",
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function createTransaction(input: {
  currentContact?: Record<string, unknown> | null;
  mutation?: "create" | "update";
}) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce([{ id: userId, status: UserStatus.ACTIVE, personId }])
    .mockResolvedValueOnce([{ userId, role: Role.HOSPITAL }])
    .mockResolvedValueOnce([{ id: hospitalId, status: HospitalStatus.ACTIVE }])
    .mockResolvedValueOnce([
      { id: "membership-id", membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    ]);
  const tx = {
    $queryRaw: queryRaw,
    user: { findFirst: vi.fn().mockResolvedValue({ id: userId }) },
    hospitalContact: {
      findUnique: vi.fn().mockResolvedValue(input.currentContact ?? null),
      create: vi.fn().mockResolvedValue({ id: hospitalContactId, updatedAt: version }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    hospital: {
      findUnique: vi.fn().mockResolvedValue({ id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" }),
    },
  };
  const transaction = vi.fn(
    async (operation: (transaction: object) => Promise<unknown>): Promise<unknown> => operation(tx),
  );
  const database = { $transaction: transaction } as unknown as HospitalContactDatabase;

  return { tx, database, transaction };
}

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId,
    expectedUpdatedAt: null,
    addressText: "ที่อยู่ 1",
    phoneNumber: null,
    ...overrides,
  };
}

function knownPrismaError(code: string, meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("private db detail", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

describe("Hospital Contact editor and Patient projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("lists a minimized, persisted direct-Owner Hospital selector in stable order", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
    ]);
    const database = { hospital: { findMany } } as unknown as HospitalContactDatabase;

    await expect(listEligibleHospitalContactOwnerHospitals(ownerActor(), database)).resolves.toEqual([
      { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
        select: { id: true, hospitalCode: true, name: true },
        where: expect.objectContaining({
          status: HospitalStatus.ACTIVE,
          memberships: expect.objectContaining({ some: expect.objectContaining({
            userId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
          }) }),
        }),
      }),
    );
  });

  it("returns only the editor projection and the row token, never the Contact row id", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: hospitalId,
      hospitalCode: "H-001",
      name: "โรงพยาบาล ก",
      contact: {
        id: hospitalContactId,
        addressText: "ถนนสุขภาพ",
        phoneNumber: "02-123-4567",
        updatedAt: version,
      },
    });
    const database = { hospital: { findFirst } } as unknown as HospitalContactDatabase;

    const result = await readHospitalContactForOwner(ownerActor(), hospitalId, database);

    expect(result).toEqual({
      hospital: { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
      addressText: "ถนนสุขภาพ",
      phoneNumber: "02-123-4567",
      expectedUpdatedAt: version.toISOString(),
    });
    expect(JSON.stringify(result)).not.toContain(hospitalContactId);
    expect(hospitalContactServiceInternals.hospitalContactEditorSelect.contact.select).not.toHaveProperty("id");
  });

  it("returns an empty editor projection with a null token when no row exists", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: hospitalId,
      hospitalCode: "H-001",
      name: "โรงพยาบาล ก",
      contact: null,
    });
    const database = { hospital: { findFirst } } as unknown as HospitalContactDatabase;

    await expect(readHospitalContactForOwner(ownerActor(), hospitalId, database)).resolves.toEqual({
      hospital: { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
      addressText: null,
      phoneNumber: null,
      expectedUpdatedAt: null,
    });
  });

  it("minimizes an exact Patient SELF projection and withholds non-ACTIVE Hospital values", async () => {
    const personFindFirst = vi.fn().mockResolvedValue({
      patientProfile: {
        hospitalRelationships: [
          {
            id: relationshipId,
            hospital: {
              hospitalCode: "H-001",
              name: "โรงพยาบาล ก",
              status: HospitalStatus.ACTIVE,
              contact: { addressText: null, phoneNumber: null },
            },
          },
        ],
      },
    });
    const patientActor = ownerActor({ roles: [Role.PATIENT, Role.HOSPITAL] });
    const database = { person: { findFirst: personFindFirst } } as unknown as HospitalContactDatabase;

    await expect(readOwnPatientHospitalContact(patientActor, relationshipId, database)).resolves.toEqual({
      relationshipId,
      availability: "AVAILABLE",
      contact: {
        hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" },
        addressText: null,
        phoneNumber: null,
      },
    });
    expect(personFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: personId,
          user: { is: { id: userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } } },
        },
      }),
    );

    personFindFirst.mockResolvedValueOnce({
      patientProfile: {
        hospitalRelationships: [
          {
            id: relationshipId,
            hospital: {
              hospitalCode: "H-001",
              name: "โรงพยาบาล ก",
              status: HospitalStatus.SUSPENDED,
              contact: { addressText: "ไม่ควรเปิดเผย", phoneNumber: "02-999-9999" },
            },
          },
        ],
      },
    });

    await expect(readOwnPatientHospitalContact(patientActor, relationshipId, database)).resolves.toEqual({
      relationshipId,
      availability: "UNAVAILABLE",
    });
  });

  it("fails closed when the persisted Patient binding or PatientProfile is missing from the relationship directory", async () => {
    const personFindFirst = vi.fn().mockResolvedValue({ patientProfile: null });
    const patientActor = ownerActor({ roles: [Role.PATIENT] });
    const database = { person: { findFirst: personFindFirst } } as unknown as HospitalContactDatabase;

    await expect(listOwnPatientHospitalContacts(patientActor, database)).rejects.toBeInstanceOf(NotFoundError);
    expect(personFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: personId,
          user: { is: { id: userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } } },
        },
      }),
    );
  });
});

describe("Hospital Contact transaction results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("treats absent plus empty desired state as NOOP without creating or auditing", async () => {
    const { tx, database } = createTransaction({ currentContact: null });

    const result = await updateHospitalContact(
      ownerActor(),
      input({ addressText: "", phoneNumber: "" }),
      { database },
    );

    expect(result).toMatchObject({ outcome: "NOOP", contact: { expectedUpdatedAt: null } });
    expect(tx.hospitalContact.create).not.toHaveBeenCalled();
    expect(tx.hospitalContact.updateMany).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("checks stale expectation before equality, including an empty existing row", async () => {
    const { tx, database } = createTransaction({
      currentContact: {
        id: hospitalContactId,
        hospitalId,
        addressText: "same",
        phoneNumber: null,
        updatedAt: version,
      },
    });

    await expect(
      updateHospitalContact(
        ownerActor(),
        input({ expectedUpdatedAt: new Date(version.getTime() - 1).toISOString(), addressText: "same" }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(tx.hospitalContact.updateMany).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns fresh identical desired state as NOOP without advancing or auditing", async () => {
    const { tx, database } = createTransaction({
      currentContact: {
        id: hospitalContactId,
        hospitalId,
        addressText: "same",
        phoneNumber: null,
        updatedAt: version,
      },
    });

    await expect(
      updateHospitalContact(
        ownerActor(),
        input({ expectedUpdatedAt: version.toISOString(), addressText: "same" }),
        { database },
      ),
    ).resolves.toMatchObject({ outcome: "NOOP", contact: { expectedUpdatedAt: version.toISOString() } });
    expect(tx.hospitalContact.updateMany).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("creates with one authoritative millisecond instant and a minimized audit", async () => {
    const now = version;
    const { tx, database } = createTransaction({ currentContact: null });

    await expect(
      updateHospitalContact(ownerActor(), input(), { database, now: () => now }),
    ).resolves.toMatchObject({
      outcome: "CREATED",
      contact: { addressText: "ที่อยู่ 1", expectedUpdatedAt: now.toISOString() },
    });
    expect(tx.hospitalContact.create).toHaveBeenCalledWith({
      data: {
        hospitalId,
        addressText: "ที่อยู่ 1",
        phoneNumber: null,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true, updatedAt: true },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      {
        actorUserId: userId,
        action: "hospital_contact.created",
        resourceType: "HospitalContact",
        resourceId: hospitalContactId,
        metadata: { hospitalId },
      },
      tx,
    );
  });

  it("updates under the exact id/hospital/version guard and advances a frozen clock", async () => {
    const current = {
      id: hospitalContactId,
      hospitalId,
      addressText: "ที่อยู่เดิม",
      phoneNumber: "02-111-1111",
      updatedAt: version,
    };
    const { tx, database } = createTransaction({ currentContact: current });

    await expect(
      updateHospitalContact(
        ownerActor(),
        input({ expectedUpdatedAt: version.toISOString(), addressText: "", phoneNumber: null }),
        { database, now: () => version },
      ),
    ).resolves.toMatchObject({
      outcome: "UPDATED",
      contact: { addressText: null, phoneNumber: null, expectedUpdatedAt: new Date(version.getTime() + 1).toISOString() },
    });
    expect(tx.hospitalContact.updateMany).toHaveBeenCalledWith({
      where: { id: hospitalContactId, hospitalId, updatedAt: version },
      data: { addressText: null, phoneNumber: null, updatedAt: new Date(version.getTime() + 1) },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        action: "hospital_contact.updated",
        resourceType: "HospitalContact",
        resourceId: hospitalContactId,
        metadata: { hospitalId },
      }),
      tx,
    );
  });

  it("locks authority in order and rechecks the persisted exact Owner predicates", async () => {
    const { tx, database } = createTransaction({ currentContact: null });

    await updateHospitalContact(ownerActor(), input(), { database });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    const sqlCalls = tx.$queryRaw.mock.calls.map(([query]) => (query as { sql: string }).sql);
    expect(sqlCalls[0]).toContain('FROM "User"');
    expect(sqlCalls[0]).toContain("FOR SHARE");
    expect(sqlCalls[1]).toContain('FROM "UserRole"');
    expect(sqlCalls[1]).toContain("FOR SHARE");
    expect(sqlCalls[2]).toContain('FROM "Hospital"');
    expect(sqlCalls[2]).toContain("FOR UPDATE");
    expect(sqlCalls[3]).toContain('FROM "HospitalMembership"');
    expect(sqlCalls[3]).toContain("FOR SHARE");
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: userId,
          personId,
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
          memberships: { some: expect.objectContaining({
            hospitalId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
          }) },
        }),
      }),
    );
  });

  it("does not retry audit failures and reports a safe infrastructure error", async () => {
    const { database, transaction } = createTransaction({ currentContact: null });
    recordAuditEvent.mockRejectedValueOnce(new Error("sensitive audit failure"));

    await expect(updateHospitalContact(ownerActor(), input(), { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(recordAuditEvent).toHaveBeenCalledOnce();
  });

  it("returns an unconfirmed result for an unknown post-callback transaction outcome", async () => {
    const { tx, database, transaction } = createTransaction({ currentContact: null });
    transaction.mockImplementation(async (operation) => {
      await operation(tx);
      throw new Error("ambiguous commit result");
    });

    await expect(updateHospitalContact(ownerActor(), input(), { database })).resolves.toEqual({
      outcome: "UNCONFIRMED",
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(recordAuditEvent).toHaveBeenCalledOnce();
  });

  it("retries P2034 only after rollback, reacquires authority, and keeps the original input", async () => {
    const { tx, database, transaction } = createTransaction({ currentContact: null });
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: userId, status: UserStatus.ACTIVE, personId }])
      .mockResolvedValueOnce([{ userId, role: Role.HOSPITAL }])
      .mockResolvedValueOnce([{ id: hospitalId, status: HospitalStatus.ACTIVE }])
      .mockResolvedValueOnce([
        { id: "membership-id", membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
      ])
      .mockResolvedValueOnce([{ id: userId, status: UserStatus.ACTIVE, personId }])
      .mockResolvedValueOnce([{ userId, role: Role.HOSPITAL }])
      .mockResolvedValueOnce([{ id: hospitalId, status: HospitalStatus.ACTIVE }])
      .mockResolvedValueOnce([
        { id: "membership-id", membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
      ]);
    let attempt = 0;
    transaction.mockImplementation(async (operation) => {
      attempt += 1;
      const value = await operation(tx);

      if (attempt < 3) {
        throw knownPrismaError("P2034");
      }

      return value;
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(updateHospitalContact(ownerActor(), input(), { database, sleep, random: () => 1 })).resolves.toMatchObject({
      outcome: "CREATED",
    });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(12);
    expect(sleep.mock.calls).toEqual([[25], [50]]);
  });

  it("maps unexpected unique failures to conflict without retrying", async () => {
    const { database, transaction } = createTransaction({ currentContact: null });
    transaction.mockRejectedValueOnce(knownPrismaError("P2002"));

    await expect(updateHospitalContact(ownerActor(), input(), { database })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("recognizes P2034 and PostgreSQL 40P01 while rejecting unrelated errors", () => {
    expect(hospitalContactServiceInternals.isRetryableTransactionFailure(knownPrismaError("P2034"))).toBe(true);
    expect(
      hospitalContactServiceInternals.isRetryableTransactionFailure(
        knownPrismaError("P2010", { code: "40P01", message: "deadlock detected" }),
      ),
    ).toBe(true);
    expect(hospitalContactServiceInternals.isRetryableTransactionFailure(knownPrismaError("P2003"))).toBe(false);
  });
});
