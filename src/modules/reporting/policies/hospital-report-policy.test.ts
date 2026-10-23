import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideHospitalReportPolicy,
  HOSPITAL_REPORT_CAPABILITIES,
} from "./hospital-report-policy";

const hospitalAId = "11111111-1111-4111-8111-111111111111";
const hospitalBId = "22222222-2222-4222-8222-222222222222";

function hospitalOwnerActor(input: {
  hospitalId?: string;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  hospitalStatus?: HospitalStatus;
  roles?: readonly Role[];
} = {}): ActorContext {
  const hospitalId = input.hospitalId ?? hospitalAId;
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: input.roles ?? [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: input.membershipType ?? MembershipType.OWNER,
        profession: null,
        status: input.membershipStatus ?? MembershipStatus.ACTIVE,
        hospitalStatus: input.hospitalStatus ?? HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

function decide(
  actor: ActorContext | null | undefined,
  capability: unknown = HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
  hospitalId = hospitalAId,
  hospitalStatus: HospitalStatus = HospitalStatus.ACTIVE,
) {
  return decideHospitalReportPolicy({ actor, capability, target: { hospitalId, hospitalStatus } });
}

describe("Hospital reporting policy", () => {
  it.each(Object.values(HOSPITAL_REPORT_CAPABILITIES))(
    "allows an active direct Hospital OWNER for %s",
    (capability) => {
      expect(decide(hospitalOwnerActor(), capability)).toEqual({
        allowed: true,
        reason: "active_direct_hospital_owner",
      });
    },
  );

  it("denies an active Hospital MEMBER", () => {
    expect(decide(hospitalOwnerActor({ membershipType: MembershipType.MEMBER }))).toMatchObject({
      allowed: false,
      reason: "active_direct_owner_required",
    });
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN, Role.CAREGIVER])("denies %s-only access", (role) => {
    expect(decide(hospitalOwnerActor({ roles: [role], membershipType: MembershipType.MEMBER }))).toMatchObject({
      allowed: false,
      reason: "hospital_role_required",
    });
  });

  it("requires the exact directly owned Hospital and does not inherit Parent or Child scope", () => {
    expect(decide(hospitalOwnerActor({ hospitalId: hospitalAId }), HOSPITAL_REPORT_CAPABILITIES.rowRead, hospitalBId)).toMatchObject({
      allowed: false,
      reason: "active_direct_owner_required",
    });
  });

  it("denies suspended membership and suspended target Hospital", () => {
    expect(decide(hospitalOwnerActor({ membershipStatus: MembershipStatus.SUSPENDED }))).toMatchObject({
      allowed: false,
      reason: "active_direct_owner_required",
    });
    expect(decide(hospitalOwnerActor(), HOSPITAL_REPORT_CAPABILITIES.export, hospitalAId, HospitalStatus.SUSPENDED)).toMatchObject({
      allowed: false,
      reason: "inactive_target_hospital",
    });
  });

  it.each(["report:program:read", "patient:read"]) (
    "does not infer Hospital reporting access from %s",
    (capability) => {
      expect(decide(hospitalOwnerActor(), capability)).toMatchObject({
        allowed: false,
        reason: "invalid_capability",
      });
    },
  );

  it("denies a missing actor", () => {
    expect(decide(null)).toEqual({ allowed: false, reason: "missing_actor" });
  });
});

describe("MEMBER report export (no OWNER grant required)", () => {
  function grantedMember(overrides: { status?: MembershipStatus; granted?: boolean; hospitalStatus?: HospitalStatus } = {}): ActorContext {
    const actor = hospitalOwnerActor({
      membershipType: MembershipType.MEMBER,
      membershipStatus: overrides.status ?? MembershipStatus.ACTIVE,
      hospitalStatus: overrides.hospitalStatus ?? HospitalStatus.ACTIVE,
    });
    return {
      ...actor,
      hospitalMemberships: actor.hospitalMemberships.map((membership) => ({
        ...membership,
        reportExportGranted: overrides.granted ?? true,
      })),
    };
  }

  it("allows export only, with or without a historical grant", () => {
    expect(decide(grantedMember(), HOSPITAL_REPORT_CAPABILITIES.export)).toEqual({
      allowed: true,
      reason: "active_hospital_member_export",
    });
    expect(decide(grantedMember({ granted: false }), HOSPITAL_REPORT_CAPABILITIES.export)).toEqual({
      allowed: true,
      reason: "active_hospital_member_export",
    });
    expect(decide(grantedMember(), HOSPITAL_REPORT_CAPABILITIES.dashboardRead).allowed).toBe(false);
    expect(decide(grantedMember(), HOSPITAL_REPORT_CAPABILITIES.rowRead).allowed).toBe(false);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.ENDED, MembershipStatus.PROVISIONED])(
    "denies a %s membership",
    (status) => {
      expect(decide(grantedMember({ status }), HOSPITAL_REPORT_CAPABILITIES.export).allowed).toBe(false);
    },
  );

  it("denies the INCLUDE_ENDED cohort, another Hospital, or an inactive Hospital", () => {
    expect(decideHospitalReportPolicy({
      actor: grantedMember({ granted: false }),
      capability: HOSPITAL_REPORT_CAPABILITIES.export,
      cohort: "INCLUDE_ENDED",
      target: { hospitalId: hospitalAId, hospitalStatus: HospitalStatus.ACTIVE },
    })).toEqual({ allowed: false, reason: "active_direct_owner_required" });
    expect(decide(grantedMember(), HOSPITAL_REPORT_CAPABILITIES.export, hospitalBId).allowed).toBe(false);
    expect(decide(grantedMember({ hospitalStatus: HospitalStatus.SUSPENDED }), HOSPITAL_REPORT_CAPABILITIES.export).allowed).toBe(false);
  });
});
