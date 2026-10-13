import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertWorkforcePasswordResetPolicy,
  decideWorkforcePasswordResetPolicy,
  type WorkforceResetTargetKind,
} from "./workforce-password-reset-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "44444444-4444-4444-8444-444444444444";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "55555555-5555-4555-8555-555555555555";

function actorWith(
  membershipType: MembershipType | null,
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    userId: actorUserId,
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.HOSPITAL],
    hospitalMemberships: membershipType
      ? [
          {
            hospitalId,
            membershipType,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ]
      : [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function decide(
  actor: ActorContext | null,
  targetKind: WorkforceResetTargetKind | string,
  overrides: { targetUserId?: string; targetHospitalId?: string } = {},
) {
  return decideWorkforcePasswordResetPolicy({
    actor,
    targetUserId: overrides.targetUserId ?? targetUserId,
    targetHospitalId: overrides.targetHospitalId ?? hospitalId,
    targetKind,
  });
}

function ownerIn(status: MembershipStatus, hospitalStatus: HospitalStatus): ActorContext {
  return actorWith(MembershipType.OWNER, {
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status,
        hospitalStatus,
      },
    ],
  });
}

describe("workforce password reset policy (ADR-0008 amendment D3)", () => {
  it.each(["HOSPITAL_MEMBER", "OSM"] as const)(
    "requires independent owner proof even for an OWNER initiating %s",
    (kind) => {
      expect(decide(actorWith(MembershipType.OWNER), kind)).toEqual({
        allowed: false,
        reason: "independent_owner_proof_unavailable",
      });
    },
  );

  it("denies an OWNER resetting another OWNER", () => {
    expect(decide(actorWith(MembershipType.OWNER), "HOSPITAL_OWNER")).toEqual({
      allowed: false,
      reason: "owner_reset_requires_platform_admin",
    });
  });

  it("requires independent owner proof even for Platform ADMIN", () => {
    const admin = actorWith(null, { roles: [Role.ADMIN] });

    expect(decide(admin, "HOSPITAL_OWNER")).toEqual({
      allowed: false,
      reason: "independent_owner_proof_unavailable",
    });
    expect(decide(admin, "HOSPITAL_OWNER", { targetHospitalId: otherHospitalId }).allowed).toBe(
      false,
    );
  });

  it("denies Platform ADMIN for non-OWNER targets", () => {
    const admin = actorWith(null, { roles: [Role.ADMIN] });

    expect(decide(admin, "HOSPITAL_MEMBER").allowed).toBe(false);
    expect(decide(admin, "OSM").allowed).toBe(false);
  });

  it.each(["HOSPITAL_MEMBER", "OSM", "HOSPITAL_OWNER"] as const)(
    "denies self reset of %s, even for an OWNER or ADMIN",
    (kind) => {
      expect(decide(actorWith(MembershipType.OWNER), kind, { targetUserId: actorUserId })).toEqual({
        allowed: false,
        reason: "self_reset_denied",
      });
      expect(
        decide(actorWith(null, { roles: [Role.ADMIN] }), kind, { targetUserId: actorUserId })
          .allowed,
      ).toBe(false);
    },
  );

  it.each(["HOSPITAL_MEMBER", "OSM", "HOSPITAL_OWNER"] as const)(
    "denies a MEMBER resetting %s",
    (kind) => {
      expect(decide(actorWith(MembershipType.MEMBER), kind).allowed).toBe(false);
    },
  );

  it("denies cross-Hospital, inactive membership, inactive Hospital and missing role", () => {
    expect(decide(actorWith(MembershipType.OWNER), "OSM", { targetHospitalId: otherHospitalId }).allowed).toBe(false);
    expect(decide(ownerIn(MembershipStatus.SUSPENDED, HospitalStatus.ACTIVE), "OSM").allowed).toBe(false);
    expect(decide(ownerIn(MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED), "OSM")).toEqual({
      allowed: false,
      reason: "active_hospital_required",
    });
    expect(decide(actorWith(MembershipType.OWNER, { roles: [Role.OSM] }), "OSM").allowed).toBe(false);
  });

  it("fails closed for a missing actor and malformed input", () => {
    expect(decide(null, "OSM")).toEqual({ allowed: false, reason: "missing_actor" });
    expect(decide(actorWith(MembershipType.OWNER), "ADMIN").allowed).toBe(false);
    expect(decide(actorWith(MembershipType.OWNER), "OSM", { targetUserId: "" }).allowed).toBe(false);
    expect(() =>
      assertWorkforcePasswordResetPolicy({
        actor: actorWith(MembershipType.MEMBER),
        targetUserId,
        targetHospitalId: hospitalId,
        targetKind: "OSM",
      }),
    ).toThrow();
  });
});
