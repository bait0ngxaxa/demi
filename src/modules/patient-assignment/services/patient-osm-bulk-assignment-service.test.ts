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
import { patientOsmBulkAssignmentRequestSchema } from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import {
  assignOsmToPatients,
  type PatientOsmAssignmentDatabase,
} from "./patient-osm-assignment-service";

type AuditRecord = {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "99999999-9999-4999-8999-999999999999";
const ownerUserId = "33333333-3333-4333-8333-333333333333";
const osmUserId = "44444444-4444-4444-8444-444444444444";
const nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-08-16T05:00:00.000Z");

function relationshipIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
}

function actorWith(membershipType: MembershipType, overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: ownerUserId,
    personId: "77777777-7777-4777-8777-777777777777",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

type FakeRelationship = {
  id: string;
  hospitalId: string;
  patientRole: boolean;
  assignments: Array<{ id: string; osmUserId: string; endedAt: Date | null }>;
};

/**
 * Minimal in-memory model of the tables the bulk assignment touches. `$transaction`
 * snapshots the state and restores it when the operation throws, so all-or-nothing
 * behavior is observable.
 */
function createFakeDatabase(input: {
  relationships: FakeRelationship[];
  eligibleOsmUserIds?: string[];
  ownerMembership?: boolean;
  failCreateOnCall?: number;
}) {
  const state = {
    relationships: new Map(
      input.relationships.map((relationship) => [relationship.id, structuredClone(relationship)]),
    ),
    audits: [] as AuditRecord[],
    createCalls: 0,
  };
  const eligibleOsm = new Set(input.eligibleOsmUserIds ?? [osmUserId]);
  let assignmentSequence = 0;

  function activeAssignments(relationship: FakeRelationship) {
    return relationship.assignments.filter((assignment) => assignment.endedAt === null);
  }

  const transaction = {
    user: {
      findUnique: vi.fn(async () => ({ status: UserStatus.ACTIVE, roles: [{ role: Role.HOSPITAL }] })),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        eligibleOsm.has(where.id) ? { id: where.id } : null,
      ),
    },
    hospitalMembership: {
      findFirst: vi.fn(async () => (input.ownerMembership === false ? null : { id: "membership" })),
    },
    patientHospitalRelationship: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const relationship = state.relationships.get(where.id);
        return relationship?.patientRole
          ? { id: relationship.id, hospitalId: relationship.hospitalId }
          : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const relationship = state.relationships.get(id);
          return relationship?.patientRole
            ? [{
                id: relationship.id,
                hospitalId: relationship.hospitalId,
                osmAssignments: activeAssignments(relationship).slice(0, 1).map(({ id: assignmentId }) => ({
                  id: assignmentId,
                })),
              }]
            : [];
        }),
      ),
    },
    patientOsmAssignment: {
      findFirst: vi.fn(async ({ where }: { where: { patientHospitalRelationshipId: string } }) => {
        const relationship = state.relationships.get(where.patientHospitalRelationshipId);
        const [active] = relationship ? activeAssignments(relationship) : [];
        return active ? { id: active.id, osmUserId: active.osmUserId } : null;
      }),
      update: vi.fn(async () => ({})),
      create: vi.fn(
        async ({ data }: { data: { patientHospitalRelationshipId: string; osmUserId: string } }) => {
          state.createCalls += 1;

          if (input.failCreateOnCall === state.createCalls) {
            throw new Prisma.PrismaClientKnownRequestError("unique", {
              code: "P2002",
              clientVersion: "test",
            });
          }

          assignmentSequence += 1;
          const id = `assignment-${assignmentSequence}`;
          state.relationships
            .get(data.patientHospitalRelationshipId)
            ?.assignments.push({ id, osmUserId: data.osmUserId, endedAt: null });
          return { id, osmUserId: data.osmUserId };
        },
      ),
    },
    auditEvent: {
      findFirst: vi.fn(async ({ where }: { where: { action: string; resourceType: string; resourceId: string } }) => {
        const found = state.audits.find(
          (audit) =>
            audit.action === where.action &&
            audit.resourceType === where.resourceType &&
            audit.resourceId === where.resourceId,
        );
        return found ? { actorUserId: found.actorUserId, metadata: found.metadata ?? null } : null;
      }),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => {
      const snapshot = {
        relationships: new Map(
          [...state.relationships].map(([id, relationship]) => [id, structuredClone(relationship)]),
        ),
        audits: [...state.audits],
      };

      try {
        return await operation(transaction as unknown as Prisma.TransactionClient);
      } catch (error: unknown) {
        state.relationships = snapshot.relationships;
        state.audits = snapshot.audits;
        throw error;
      }
    }),
  } as unknown as PatientOsmAssignmentDatabase;

  mockedAudit.mockImplementation(async (record: AuditRecord) => {
    state.audits.push(record);
  });

  return { database, state, transaction };
}

function freeRelationships(ids: readonly string[], overrides: Partial<FakeRelationship> = {}): FakeRelationship[] {
  return ids.map((id) => ({
    id,
    hospitalId,
    patientRole: true,
    assignments: [],
    ...overrides,
  }));
}

function request(ids: readonly string[], overrides: Record<string, unknown> = {}) {
  return {
    hospitalId,
    osmUserId,
    patientHospitalRelationshipIds: [...ids],
    submissionNonce: nonce,
    ...overrides,
  };
}

function activeCount(state: ReturnType<typeof createFakeDatabase>["state"]): number {
  return [...state.relationships.values()].reduce(
    (total, relationship) =>
      total + relationship.assignments.filter((assignment) => assignment.endedAt === null).length,
    0,
  );
}

describe("bulk OSM assignment request schema", () => {
  it("bounds the batch to 1..500 unique patients and requires a nonce", () => {
    const ids = relationshipIds(500);

    expect(patientOsmBulkAssignmentRequestSchema.safeParse(request(ids)).success).toBe(true);
    expect(patientOsmBulkAssignmentRequestSchema.safeParse(request([])).success).toBe(false);
    expect(patientOsmBulkAssignmentRequestSchema.safeParse(request(relationshipIds(501))).success).toBe(false);
    expect(patientOsmBulkAssignmentRequestSchema.safeParse(request([ids[0], ids[0]])).success).toBe(false);
    expect(
      patientOsmBulkAssignmentRequestSchema.safeParse(request(ids.slice(0, 2), { submissionNonce: "x" })).success,
    ).toBe(false);
    expect(
      patientOsmBulkAssignmentRequestSchema.safeParse(request(ids.slice(0, 2), { extra: true })).success,
    ).toBe(false);
  });
});

describe("assignOsmToPatients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns every selected patient, writes one audit per assignment and one batch marker", async () => {
    const ids = relationshipIds(3);
    const { database, state } = createFakeDatabase({ relationships: freeRelationships(ids) });

    const result = await assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), {
      database,
      now: () => now,
    });

    expect(result).toEqual({ operation: "ASSIGNED", hospitalId, osmUserId, assignedCount: 3 });
    expect(activeCount(state)).toBe(3);
    expect(state.audits.filter(({ action }) => action === "patient.osm_assigned")).toHaveLength(3);
    expect(state.audits.filter(({ action }) => action === "patient.osm_bulk_assigned")).toEqual([
      {
        actorUserId: ownerUserId,
        action: "patient.osm_bulk_assigned",
        resourceType: "PatientOsmBulkAssignment",
        resourceId: nonce,
        metadata: { hospitalId, osmUserId, assignedCount: 3 },
      },
    ]);
  });

  it("handles the maximum batch of 500 in one transaction with a widened timeout", async () => {
    const ids = relationshipIds(500);
    const { database, state } = createFakeDatabase({ relationships: freeRelationships(ids) });

    const result = await assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), {
      database,
      now: () => now,
    });

    expect(result.assignedCount).toBe(500);
    expect(activeCount(state)).toBe(500);
    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(database.$transaction).mock.calls[0]?.[1]).toMatchObject({ timeout: 60_000 });
  });

  it("denies a MEMBER before touching any patient", async () => {
    const ids = relationshipIds(2);
    const { database, state, transaction } = createFakeDatabase({ relationships: freeRelationships(ids) });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.MEMBER), request(ids), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(activeCount(state)).toBe(0);
    expect(transaction.patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies an actor who owns another hospital only", async () => {
    const ids = relationshipIds(1);
    const { database, state } = createFakeDatabase({ relationships: freeRelationships(ids) });
    const actor = actorWith(MembershipType.OWNER, {
      hospitalMemberships: [
        {
          hospitalId: otherHospitalId,
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    await expect(assignOsmToPatients(actor, request(ids), { database, now: () => now })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(activeCount(state)).toBe(0);
  });

  it("denies a patient of another hospital and rolls back the whole batch", async () => {
    const ids = relationshipIds(3);
    const relationships = freeRelationships(ids);
    relationships[2] = { ...relationships[2]!, hospitalId: otherHospitalId };
    const { database, state } = createFakeDatabase({ relationships });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(activeCount(state)).toBe(0);
    expect(state.audits).toEqual([]);
  });

  it("denies an OSM of another hospital", async () => {
    const ids = relationshipIds(2);
    const { database, state } = createFakeDatabase({
      relationships: freeRelationships(ids),
      eligibleOsmUserIds: [],
    });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(activeCount(state)).toBe(0);
  });

  it("denies self-assignment", async () => {
    const ids = relationshipIds(2);
    const { database, state } = createFakeDatabase({
      relationships: freeRelationships(ids),
      eligibleOsmUserIds: [ownerUserId],
    });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids, { osmUserId: ownerUserId }), {
        database,
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(activeCount(state)).toBe(0);
  });

  it("rejects a selection that includes an already-assigned patient, without reassigning", async () => {
    const ids = relationshipIds(3);
    const relationships = freeRelationships(ids);
    relationships[1] = {
      ...relationships[1]!,
      assignments: [{ id: "existing", osmUserId: "55555555-5555-4555-8555-555555555555", endedAt: null }],
    };
    const { database, state } = createFakeDatabase({ relationships });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), { database, now: () => now }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(activeCount(state)).toBe(1);
    expect(state.relationships.get(ids[1]!)?.assignments).toEqual([
      { id: "existing", osmUserId: "55555555-5555-4555-8555-555555555555", endedAt: null },
    ]);
    expect(state.audits).toEqual([]);
  });

  it("rejects a selection that includes an unknown patient and rolls back", async () => {
    const ids = relationshipIds(3);
    const { database, state } = createFakeDatabase({ relationships: freeRelationships(ids.slice(0, 2)) });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), { database, now: () => now }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(activeCount(state)).toBe(0);
  });

  it("rejects a patient without the patient role", async () => {
    const ids = relationshipIds(2);
    const relationships = freeRelationships(ids);
    relationships[0] = { ...relationships[0]!, patientRole: false };
    const { database, state } = createFakeDatabase({ relationships });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), { database, now: () => now }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(activeCount(state)).toBe(0);
  });

  it("rolls back every assignment when one item fails mid-batch", async () => {
    const ids = relationshipIds(5);
    const { database, state } = createFakeDatabase({
      relationships: freeRelationships(ids),
      failCreateOnCall: 4,
    });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), request(ids), {
        database,
        now: () => now,
        transactionRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(activeCount(state)).toBe(0);
    expect(state.audits).toEqual([]);
  });

  it("replays a double submit of the same nonce instead of assigning twice", async () => {
    const ids = relationshipIds(3);
    const { database, state, transaction } = createFakeDatabase({ relationships: freeRelationships(ids) });
    const actor = actorWith(MembershipType.OWNER);

    const first = await assignOsmToPatients(actor, request(ids), { database, now: () => now });
    const createCallsAfterFirst = transaction.patientOsmAssignment.create.mock.calls.length;
    const second = await assignOsmToPatients(actor, request(ids), { database, now: () => now });

    expect(first.operation).toBe("ASSIGNED");
    expect(second).toEqual({ operation: "REPLAYED", hospitalId, osmUserId, assignedCount: 3 });
    expect(transaction.patientOsmAssignment.create.mock.calls.length).toBe(createCallsAfterFirst);
    expect(activeCount(state)).toBe(3);
    expect(state.audits.filter(({ action }) => action === "patient.osm_bulk_assigned")).toHaveLength(1);
  });

  it("rejects a reused nonce for a different request", async () => {
    const ids = relationshipIds(2);
    const otherOsmUserId = "55555555-5555-4555-8555-555555555555";
    const { database, state } = createFakeDatabase({
      relationships: freeRelationships(ids),
      eligibleOsmUserIds: [osmUserId, otherOsmUserId],
    });
    const actor = actorWith(MembershipType.OWNER);

    await assignOsmToPatients(actor, request(ids), { database, now: () => now });

    await expect(
      assignOsmToPatients(actor, request(ids, { osmUserId: otherOsmUserId }), {
        database,
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(activeCount(state)).toBe(2);
  });

  it("rejects malformed input before any database work", async () => {
    const { database } = createFakeDatabase({ relationships: [] });

    await expect(
      assignOsmToPatients(actorWith(MembershipType.OWNER), { hospitalId: "x" }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(assignOsmToPatients(null, request(relationshipIds(1)), { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
