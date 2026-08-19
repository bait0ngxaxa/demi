import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

import {
  demoteHospitalOwner,
  promoteHospitalOwner,
  type WorkforceDatabase,
} from "./workforce-service";

const mockedRecordAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedRecordAuditEvent,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "33333333-3333-4333-8333-333333333333";
const actorMembershipId = "44444444-4444-4444-8444-444444444444";
const targetMembershipId = "55555555-5555-4555-8555-555555555555";
const initialUpdatedAt = new Date("2026-08-18T05:00:00.000Z");

type FakeMembership = {
  id: string;
  userId: string;
  hospitalId: string;
  membershipType: MembershipType;
  status: MembershipStatus;
  profession: null;
  updatedAt: Date;
};

type FakeUser = {
  status: UserStatus;
  roles: Role[];
};

type FakeState = {
  hospitalStatus: HospitalStatus;
  memberships: FakeMembership[];
  users: Map<string, FakeUser>;
};

function createActor(): ActorContext {
  return {
    userId: actorUserId,
    personId: "66666666-6666-4666-8666-666666666666",
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
  };
}

function createState(targetType: MembershipType): FakeState {
  const memberships: FakeMembership[] = [
    {
      id: actorMembershipId,
      userId: actorUserId,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      profession: null,
      updatedAt: new Date(initialUpdatedAt),
    },
    {
      id: targetMembershipId,
      userId: targetUserId,
      hospitalId,
      membershipType: targetType,
      status: MembershipStatus.ACTIVE,
      profession: null,
      updatedAt: new Date(initialUpdatedAt),
    },
  ];

  return {
    hospitalStatus: HospitalStatus.ACTIVE,
    memberships,
    users: new Map([
      [actorUserId, { status: UserStatus.ACTIVE, roles: [Role.HOSPITAL] }],
      [targetUserId, { status: UserStatus.ACTIVE, roles: [Role.HOSPITAL] }],
    ]),
  };
}

function createDatabase(state: FakeState): WorkforceDatabase {
  const database = {
    $transaction: async (
      operation: (transaction: unknown) => Promise<unknown>,
    ): Promise<unknown> => operation(database),
    user: {
      findUnique: vi.fn(async (args: unknown) => {
        const where = (args as { where: { id?: string } }).where;
        const user = where.id ? state.users.get(where.id) : undefined;
        return user
          ? { status: user.status, roles: user.roles.map((role) => ({ role })) }
          : null;
      }),
    },
    hospitalMembership: {
      findFirst: vi.fn(async (args: unknown) => {
        const where = (args as {
          where: { userId?: string; hospitalId?: string; id?: string };
        }).where;

        if (where.userId) {
          const actorMembership = state.memberships.find(
            (membership) =>
              membership.userId === where.userId &&
              membership.hospitalId === where.hospitalId &&
              membership.membershipType === MembershipType.OWNER &&
              membership.status === MembershipStatus.ACTIVE &&
              state.hospitalStatus === HospitalStatus.ACTIVE,
          );
          return actorMembership ? { id: actorMembership.id } : null;
        }

        const membership = state.memberships.find(
          (candidate) => candidate.id === where.id && candidate.hospitalId === where.hospitalId,
        );

        if (!membership) {
          return null;
        }

        const user = state.users.get(membership.userId);
        return {
          ...membership,
          hospital: { status: state.hospitalStatus },
          user: {
            status: user?.status ?? UserStatus.SUSPENDED,
            roles: user?.roles.map((role) => ({ role })) ?? [],
          },
        };
      }),
      count: vi.fn(async (args: unknown) => {
        const where = (args as { where: { hospitalId: string } }).where;
        return state.memberships.filter((membership) => {
          const user = state.users.get(membership.userId);
          return (
            membership.hospitalId === where.hospitalId &&
            membership.membershipType === MembershipType.OWNER &&
            membership.status === MembershipStatus.ACTIVE &&
            user?.status === UserStatus.ACTIVE &&
            user.roles.includes(Role.HOSPITAL)
          );
        }).length;
      }),
      updateMany: vi.fn(async (args: unknown) => {
        const where = (args as {
          where: {
            id: string;
            hospitalId: string;
            membershipType: MembershipType;
            status: MembershipStatus;
            updatedAt: Date;
          };
          data: { membershipType: MembershipType };
        }).where;
        const membership = state.memberships.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.hospitalId === where.hospitalId &&
            candidate.membershipType === where.membershipType &&
            candidate.status === where.status &&
            candidate.updatedAt.getTime() === where.updatedAt.getTime(),
        );

        if (!membership) {
          return { count: 0 };
        }

        membership.membershipType = (args as { data: { membershipType: MembershipType } }).data.membershipType;
        membership.updatedAt = new Date(membership.updatedAt.getTime() + 1_000);
        return { count: 1 };
      }),
      findUnique: vi.fn(async (args: unknown) => {
        const where = (args as { where: { id: string } }).where;
        const membership = state.memberships.find((candidate) => candidate.id === where.id);
        return membership
          ? {
              id: membership.id,
              hospitalId: membership.hospitalId,
              membershipType: membership.membershipType,
              updatedAt: membership.updatedAt,
            }
          : null;
      }),
    },
  } as unknown as WorkforceDatabase;

  return database;
}

function inputFor(membershipId: string, expectedUpdatedAt = initialUpdatedAt): {
  relationshipId: string;
  targetHospitalId: string;
  expectedUpdatedAt: string;
} {
  return {
    relationshipId: membershipId,
    targetHospitalId: hospitalId,
    expectedUpdatedAt: expectedUpdatedAt.toISOString(),
  };
}

describe("Hospital Owner governance service", () => {
  beforeEach(() => {
    mockedRecordAuditEvent.mockClear();
  });

  it("promotes an active Member and records only the bounded transition audit", async () => {
    const state = createState(MembershipType.MEMBER);
    const database = createDatabase(state);

    const result = await promoteHospitalOwner(createActor(), inputFor(targetMembershipId), {
      database,
    });

    expect(result.membershipType).toBe(MembershipType.OWNER);
    expect(state.memberships.find(({ id }) => id === targetMembershipId)?.membershipType).toBe(
      MembershipType.OWNER,
    );
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "hospital_owner.promoted",
        metadata: expect.objectContaining({
          hospitalId,
          targetMembershipId,
          targetUserId,
          fromMembershipType: MembershipType.MEMBER,
          toMembershipType: MembershipType.OWNER,
        }),
      }),
      database,
    );
  });

  it("allows demotion while another eligible Owner remains", async () => {
    const state = createState(MembershipType.OWNER);
    const database = createDatabase(state);

    const result = await demoteHospitalOwner(createActor(), inputFor(targetMembershipId), {
      database,
    });

    expect(result.membershipType).toBe(MembershipType.MEMBER);
    expect(state.memberships.find(({ id }) => id === targetMembershipId)).toMatchObject({
      membershipType: MembershipType.MEMBER,
      status: MembershipStatus.ACTIVE,
    });
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "hospital_owner.demoted" }),
      database,
    );
  });

  it("rejects final Owner demotion before changing membership or audit state", async () => {
    const state = createState(MembershipType.MEMBER);
    state.memberships = state.memberships.filter(({ id }) => id !== targetMembershipId);
    const database = createDatabase(state);
    await expect(
      demoteHospitalOwner(createActor(), inputFor(actorMembershipId), { database }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(state.memberships[0]).toMatchObject({
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
    });
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
  });

  it("revalidates the actor inside the transaction and rejects a stale Owner context", async () => {
    const state = createState(MembershipType.MEMBER);
    state.memberships[0].membershipType = MembershipType.MEMBER;
    const database = createDatabase(state);
    await expect(
      promoteHospitalOwner(createActor(), inputFor(targetMembershipId), { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(state.memberships.find(({ id }) => id === targetMembershipId)?.membershipType).toBe(
      MembershipType.MEMBER,
    );
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a stale target version without mutating the membership", async () => {
    const state = createState(MembershipType.MEMBER);
    const database = createDatabase(state);
    mockedRecordAuditEvent.mockClear();

    await expect(
      promoteHospitalOwner(
        createActor(),
        inputFor(targetMembershipId, new Date("2026-08-18T05:01:00.000Z")),
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(state.memberships.find(({ id }) => id === targetMembershipId)?.membershipType).toBe(
      MembershipType.MEMBER,
    );
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
  });
});
