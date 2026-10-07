import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError } from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";
import {
  createActorContextStore,
  isUnauthenticatedAuthError,
  resolveActorAccessByAuthSubject,
  resolveActorAccessByUserId,
  resolveActorContextByAuthSubject,
  resolveCurrentActorAccess,
  resolveCurrentActorContext,
  type ActorContextStore,
  type ActorContextUserIdStore,
  type ActorUserRecord,
} from "./actor-context-service";

vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: vi.fn(),
}));

const mockedGetServerSupabaseClient = vi.mocked(getServerSupabaseClient);

const actor: ActorContext = {
  userId: "user-1",
  personId: "person-1",
  roles: [Role.PATIENT],
  hospitalMemberships: [
    {
      hospitalId: "hospital-a",
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

function createActorUserRecord(status: UserStatus = UserStatus.ACTIVE): ActorUserRecord {
  return {
    id: actor.userId,
    personId: actor.personId,
    status,
    roles: actor.roles,
    hospitalMemberships: actor.hospitalMemberships,
    osmHospitalRelationships: actor.osmHospitalRelationships,
  };
}

describe("ActorContext resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes an authenticated provider subject before lookup", async () => {
    let receivedSubject = "";
    const store: ActorContextStore = {
      async findUserByAuthSubject(authSubject): Promise<ActorUserRecord | null> {
        receivedSubject = authSubject;
        return createActorUserRecord();
      },
    };

    const result = await resolveActorContextByAuthSubject("  supabase-user-1  ", store);

    expect(receivedSubject).toBe("supabase-user-1");
    expect(result).toEqual(actor);
  });

  it("preserves OSM Hospital relationships in the resolved ActorContext", async () => {
    const osmActor: ActorContext = {
      ...actor,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: "hospital-osm",
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    };
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        return {
          ...createActorUserRecord(),
          roles: osmActor.roles,
          hospitalMemberships: osmActor.hospitalMemberships,
          osmHospitalRelationships: osmActor.osmHospitalRelationships,
        };
      },
    };

    await expect(resolveActorContextByAuthSubject("provider-user-osm", store)).resolves.toEqual(
      osmActor,
    );
  });

  it("fails closed when the provider subject is empty", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        throw new Error("The store must not be called");
      },
    };

    await expect(resolveActorContextByAuthSubject("  ", store)).resolves.toBeNull();
  });

  it("allows an ACTIVE mapped DEMI user", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        return createActorUserRecord();
      },
    };

    await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
      status: "AUTHORIZED",
      actor,
    });
  });

  it("resolves by User ID through the same canonical actor mapping without Supabase", async () => {
    const record = {
      ...createActorUserRecord(),
      roles: [Role.PATIENT, Role.OSM],
      osmHospitalRelationships: [
        {
          hospitalId: "hospital-osm",
          status: MembershipStatus.SUSPENDED,
          hospitalStatus: HospitalStatus.SUSPENDED,
        },
      ],
    } satisfies ActorUserRecord;
    const store: ActorContextStore & ActorContextUserIdStore = {
      findUserByAuthSubject: vi.fn().mockResolvedValue(record),
      findUserById: vi.fn().mockResolvedValue(record),
    };

    const [subjectAccess, userIdAccess] = await Promise.all([
      resolveActorAccessByAuthSubject("provider-user-1", store),
      resolveActorAccessByUserId(actor.userId, store),
    ]);

    expect(userIdAccess).toEqual(subjectAccess);
    expect(userIdAccess).toMatchObject({
      status: "AUTHORIZED",
      actor: {
        userId: actor.userId,
        personId: actor.personId,
        roles: [Role.PATIENT, Role.OSM],
        osmHospitalRelationships: [
          {
            hospitalId: "hospital-osm",
            status: MembershipStatus.SUSPENDED,
            hospitalStatus: HospitalStatus.SUSPENDED,
          },
        ],
      },
    });
    expect(mockedGetServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("preserves unmapped and inactive account states in the User-ID resolver", async () => {
    const store: ActorContextUserIdStore = {
      findUserById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(
        createActorUserRecord(UserStatus.SUSPENDED),
      ),
    };

    await expect(resolveActorAccessByUserId(actor.userId, store)).resolves.toEqual({
      status: "UNMAPPED",
    });
    await expect(resolveActorAccessByUserId(actor.userId, store)).resolves.toEqual({
      status: "ACCOUNT_NOT_ACTIVE",
      accountStatus: UserStatus.SUSPENDED,
    });
  });

  it("uses an injected transaction client for the User-ID lookup", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
      roles: [{ role: Role.PATIENT }],
      memberships: [{
        hospitalId: "hospital-a",
        membershipType: MembershipType.MEMBER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      }],
      osmHospitalRelationships: [],
    });
    const store = createActorContextStore(
      { user: { findUnique } } as unknown as Prisma.TransactionClient,
    );

    await expect(resolveActorAccessByUserId(actor.userId, store)).resolves.toMatchObject({
      status: "AUTHORIZED",
      actor,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: actor.userId } }),
    );
  });

  it("denies an unmapped provider user", async () => {
    const store: ActorContextStore = {
      async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
        return null;
      },
    };

    await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
      status: "UNMAPPED",
    });
  });

  it.each([UserStatus.PROVISIONED, UserStatus.INVITED, UserStatus.SUSPENDED])(
    "denies a mapped %s DEMI user",
    async (status) => {
      const store: ActorContextStore = {
        async findUserByAuthSubject(): Promise<ActorUserRecord | null> {
          return createActorUserRecord(status);
        },
      };

      await expect(resolveActorAccessByAuthSubject("provider-user-1", store)).resolves.toEqual({
        status: "ACCOUNT_NOT_ACTIVE",
        accountStatus: status,
      });
    },
  );

  it("treats a missing session as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).resolves.toBeNull();
  });

  it.each([
    ["invalid JWT", "bad_jwt"],
    ["expired session", "session_expired"],
    ["revoked refresh token", "refresh_token_not_found"],
  ])("treats a known %s condition as unauthenticated", async (_label, code) => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("The session is no longer valid", 401, code),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).resolves.toBeNull();
  });

  it("does not classify a generic provider status as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Unexpected provider failure", 401, "unexpected_failure"),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("does not classify an untyped provider error as unauthenticated", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Auth provider is unavailable"),
    });
    mockedGetServerSupabaseClient.mockResolvedValue({ auth: { getUser } } as unknown as Awaited<
      ReturnType<typeof getServerSupabaseClient>
    >);

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("does not classify auth client configuration failures as unauthenticated", async () => {
    mockedGetServerSupabaseClient.mockRejectedValue(new Error("Auth configuration is invalid"));

    await expect(resolveCurrentActorContext()).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("fails closed before actor lookup when the provider subject is unexpected", async () => {
    const store: ActorContextStore = {
      findUserByAuthSubject: vi.fn().mockResolvedValue(createActorUserRecord()),
    };
    const provider = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "unexpected-provider-user" } },
        error: null,
      }),
    };

    await expect(
      resolveCurrentActorAccess(store, provider, "expected-provider-user"),
    ).resolves.toEqual({
      status: "APPLICATION_ACCESS_DENIED",
      reason: "SUBJECT_MISMATCH",
    });
    expect(store.findUserByAuthSubject).not.toHaveBeenCalled();
  });

  it("uses stable auth identity and codes rather than HTTP status alone", () => {
    expect(isUnauthenticatedAuthError(new AuthSessionMissingError())).toBe(true);
    expect(isUnauthenticatedAuthError(new AuthApiError("expired", 401, "session_expired"))).toBe(
      true,
    );
    expect(isUnauthenticatedAuthError(new AuthApiError("unexpected", 404, "unexpected_failure"))).toBe(
      false,
    );
    expect(isUnauthenticatedAuthError({ status: 401 })).toBe(false);
  });
});
