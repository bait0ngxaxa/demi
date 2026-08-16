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
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import {
  assignOsmToPatient,
  unassignOsmFromPatient,
  type PatientOsmAssignmentDatabase,
} from "./patient-osm-assignment-service";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "33333333-3333-4333-8333-333333333333";
const osmUserId = "44444444-4444-4444-8444-444444444444";
const otherOsmUserId = "55555555-5555-4555-8555-555555555555";
const assignmentId = "66666666-6666-4666-8666-666666666666";
const now = new Date("2026-08-16T05:00:00.000Z");

function ownerActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: ownerUserId,
    personId: "77777777-7777-4777-8777-777777777777",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function createDatabase(input: {
  activeAssignment?: { id: string; osmUserId: string } | null;
  targetOsmUserId?: string;
  ownerMembership?: boolean;
} = {}): {
  database: PatientOsmAssignmentDatabase;
  transaction: {
    patientOsmAssignment: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
} {
  const assignmentFindFirst = vi.fn().mockResolvedValue(input.activeAssignment ?? null);
  const assignmentUpdate = vi.fn().mockResolvedValue({});
  const assignmentCreate = vi.fn().mockResolvedValue({
    id: assignmentId,
    osmUserId: input.targetOsmUserId ?? osmUserId,
  });
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        status: UserStatus.ACTIVE,
        roles: [{ role: Role.HOSPITAL }],
      }),
      findFirst: vi.fn().mockResolvedValue({ id: input.targetOsmUserId ?? osmUserId }),
    },
    hospitalMembership: {
      findFirst: vi.fn().mockResolvedValue(input.ownerMembership === false ? null : { id: "membership" }),
    },
    patientHospitalRelationship: {
      findFirst: vi.fn().mockResolvedValue({ id: relationshipId, hospitalId }),
    },
    patientOsmAssignment: {
      findFirst: assignmentFindFirst,
      update: assignmentUpdate,
      create: assignmentCreate,
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientOsmAssignmentDatabase;

  return {
    database,
    transaction: {
      patientOsmAssignment: {
        findFirst: assignmentFindFirst,
        update: assignmentUpdate,
        create: assignmentCreate,
      },
    },
  };
}

describe("PatientOsmAssignmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
  });

  it("creates an initial assignment and audits only opaque IDs", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      assignOsmToPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId, osmUserId },
        { database, now: () => now },
      ),
    ).resolves.toMatchObject({ operation: "ASSIGNED", osmUserId });

    expect(transaction.patientOsmAssignment.create).toHaveBeenCalledWith({
      data: {
        patientHospitalRelationshipId: relationshipId,
        osmUserId,
        assignedByUserId: ownerUserId,
        createdAt: now,
      },
      select: { id: true, osmUserId: true },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient.osm_assigned",
        resourceType: "PatientOsmAssignment",
        metadata: expect.objectContaining({ hospitalId, patientHospitalRelationshipId: relationshipId, osmUserId }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("nationalId");
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("HN");
  });

  it("makes repeating the same active assignment an audited no-op", async () => {
    const { database, transaction } = createDatabase({
      activeAssignment: { id: assignmentId, osmUserId },
    });

    await expect(
      assignOsmToPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId, osmUserId },
        { database, now: () => now },
      ),
    ).resolves.toMatchObject({ operation: "NOOP", assignmentId });

    expect(transaction.patientOsmAssignment.create).not.toHaveBeenCalled();
    expect(transaction.patientOsmAssignment.update).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("ends the previous row before creating a reassignment", async () => {
    const { database, transaction } = createDatabase({
      activeAssignment: { id: assignmentId, osmUserId },
      targetOsmUserId: otherOsmUserId,
    });

    await expect(
      assignOsmToPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId, osmUserId: otherOsmUserId },
        { database, now: () => now },
      ),
    ).resolves.toMatchObject({ operation: "REASSIGNED", previousOsmUserId: osmUserId });

    expect(transaction.patientOsmAssignment.update).toHaveBeenCalledWith({
      where: { id: assignmentId },
      data: { endedAt: now, endedByUserId: ownerUserId },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient.osm_reassigned",
        metadata: expect.objectContaining({ previousOsmUserId: osmUserId, osmUserId: otherOsmUserId }),
      }),
      expect.anything(),
    );
  });

  it("ends the current assignment and treats an empty unassignment as a no-op", async () => {
    const first = createDatabase({ activeAssignment: { id: assignmentId, osmUserId } });

    await expect(
      unassignOsmFromPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId },
        { database: first.database, now: () => now },
      ),
    ).resolves.toMatchObject({ operation: "UNASSIGNED", previousOsmUserId: osmUserId });
    expect(first.transaction.patientOsmAssignment.update).toHaveBeenCalledWith({
      where: { id: assignmentId },
      data: { endedAt: now, endedByUserId: ownerUserId },
    });

    const empty = createDatabase();
    await expect(
      unassignOsmFromPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId },
        { database: empty.database, now: () => now },
      ),
    ).resolves.toMatchObject({ operation: "NOOP", assignmentId: null });
    expect(mockedAudit).toHaveBeenCalledTimes(1);
  });

  it("denies a Hospital member before writing assignment state", async () => {
    const { database, transaction } = createDatabase({ ownerMembership: false });
    const member = ownerActor({
      hospitalMemberships: [
        {
          hospitalId,
          membershipType: MembershipType.MEMBER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    await expect(
      assignOsmToPatient(
        member,
        { patientHospitalRelationshipId: relationshipId, osmUserId },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientOsmAssignment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("does not report success when audit persistence fails", async () => {
    mockedAudit.mockRejectedValue(new InfrastructureError());
    const { database } = createDatabase();

    await expect(
      assignOsmToPatient(
        ownerActor(),
        { patientHospitalRelationshipId: relationshipId, osmUserId },
        { database, now: () => now },
      ),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });
});
