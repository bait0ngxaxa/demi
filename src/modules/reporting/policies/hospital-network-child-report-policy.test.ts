import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideHospitalNetworkChildReportPolicy,
  HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES,
} from "./hospital-network-child-report-policy";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "33333333-3333-4333-8333-333333333333";
const parentOwnerMembership = {
  hospitalId: parentHospitalId,
  membershipType: MembershipType.OWNER,
  profession: null,
  status: MembershipStatus.ACTIVE,
  hospitalStatus: HospitalStatus.ACTIVE,
};

const actor: ActorContext = {
  userId: ownerUserId,
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL, Role.ADMIN],
  hospitalMemberships: [parentOwnerMembership],
  osmHospitalRelationships: [],
};

const parent = {
  id: parentHospitalId,
  status: HospitalStatus.ACTIVE,
  parentHospitalId: null,
};

const child = {
  id: childHospitalId,
  status: HospitalStatus.ACTIVE,
  parentHospitalId: parentHospitalId,
};

const hierarchy = { parent, child, issues: [] };

function decide(input: Partial<Parameters<typeof decideHospitalNetworkChildReportPolicy>[0]> = {}) {
  return decideHospitalNetworkChildReportPolicy({
    actor,
    capability: HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.read,
    hierarchy,
    ...input,
  });
}

describe("Hospital Network Child reporting policy", () => {
  it("allows the exact active direct Child target through the distinct Parent reporting capability", () => {
    expect(decide()).toEqual({
      allowed: true,
      reason: "active_parent_owner_direct_child_report",
    });
  });

  it("does not inherit the Parent path from ADMIN-only, OSM-only or PATIENT-only roles", () => {
    for (const role of [Role.ADMIN, Role.OSM, Role.PATIENT]) {
      expect(decide({ actor: { ...actor, roles: [role] } })).toMatchObject({
        allowed: false,
        reason: "hospital_role_required",
      });
    }
  });

  it("rejects an unrelated operation capability", () => {
    expect(decide({ capability: "global:report:hospital:read" })).toMatchObject({
      allowed: false,
      reason: "invalid_capability",
    });
  });

  it("requires direct ACTIVE OWNER membership at this exact Parent, without requiring Child ownership", () => {
    expect(decide({ actor: { ...actor, hospitalMemberships: [] } })).toMatchObject({
      allowed: false,
      reason: "active_parent_owner_required",
    });
    expect(decide({ actor: {
      ...actor,
      hospitalMemberships: [{
        ...parentOwnerMembership,
        membershipType: MembershipType.MEMBER,
      }],
    } })).toMatchObject({
      allowed: false,
      reason: "active_parent_owner_required",
    });
    for (const membership of [
      { ...parentOwnerMembership, status: MembershipStatus.SUSPENDED },
      { ...parentOwnerMembership, hospitalStatus: HospitalStatus.SUSPENDED },
      { ...parentOwnerMembership, hospitalId: childHospitalId },
    ]) {
      expect(decide({ actor: { ...actor, hospitalMemberships: [membership] } })).toMatchObject({
        allowed: false,
        reason: "active_parent_owner_required",
      });
    }
    expect(decide()).toMatchObject({ allowed: true });
  });

  it("denies a missing actor, malformed target identifier, or Parent used as Child target", () => {
    expect(decide({ actor: null })).toMatchObject({ allowed: false, reason: "missing_actor" });
    expect(decide({ hierarchy: { ...hierarchy, child: { ...child, id: "invalid-id" } } })).toMatchObject({
      allowed: false,
      reason: "invalid_hospital_scope",
    });
    expect(decide({ hierarchy: { ...hierarchy, child: { ...child, id: parentHospitalId } } })).toMatchObject({
      allowed: false,
      reason: "invalid_hospital_scope",
    });
  });

  it("fails closed when the resolved Parent/Child scope is not an active direct relationship", () => {
    expect(decide({ hierarchy: { ...hierarchy, child: { ...child, parentHospitalId: null } } })).toMatchObject({
      allowed: false,
      reason: "invalid_hospital_scope",
    });
    expect(decide({ hierarchy: { ...hierarchy, child: { ...child, status: HospitalStatus.SUSPENDED } } })).toMatchObject({
      allowed: false,
      reason: "inactive_child_hospital",
    });
    expect(decide({ hierarchy: { ...hierarchy, parent: { ...parent, parentHospitalId: childHospitalId } } })).toMatchObject({
      allowed: false,
      reason: "invalid_hospital_scope",
    });
    expect(decide({ hierarchy: {
      ...hierarchy,
      issues: [{ code: "CYCLE" }],
    } })).toMatchObject({
      allowed: false,
      reason: "invalid_hospital_scope",
    });
  });
});
