import { HospitalStatus, Role, UserStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideGlobalReportingPolicy,
  GLOBAL_REPORTING_CAPABILITIES,
} from "./global-reporting-policy";

const actor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

function decide(overrides: Partial<Parameters<typeof decideGlobalReportingPolicy>[0]> = {}) {
  return decideGlobalReportingPolicy({
    actor,
    capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
    currentUserStatus: UserStatus.ACTIVE,
    currentRoles: [Role.ADMIN],
    ...overrides,
  });
}

describe("Global Reporting policy", () => {
  it("allows an active Platform ADMIN under the Global Reporting role contract", () => {
    expect(decide()).toEqual({ allowed: true, reason: "eligible_active_platform_admin" });
    expect(decide({ currentRoles: [] })).toMatchObject({ allowed: false, reason: "active_admin_required" });
    expect(decide({ currentUserStatus: UserStatus.SUSPENDED })).toMatchObject({ allowed: false, reason: "active_admin_required" });
  });

  it("keeps the Global capabilities independent from Hospital OWNER memberships", () => {
    expect(decide({
      actor: { ...actor, roles: [Role.HOSPITAL] },
      currentRoles: [Role.HOSPITAL],
    })).toMatchObject({
      allowed: false,
      reason: "active_admin_required",
    });
    expect(decide({ actor: { ...actor, roles: [Role.OSM] }, currentRoles: [Role.OSM] })).toMatchObject({
      allowed: false,
      reason: "active_admin_required",
    });
    expect(decide({ actor: { ...actor, roles: [Role.PATIENT] }, currentRoles: [Role.PATIENT] })).toMatchObject({
      allowed: false,
      reason: "active_admin_required",
    });
    expect(decide({ actor: { ...actor, roles: [Role.CAREGIVER] }, currentRoles: [Role.CAREGIVER] })).toMatchObject({
      allowed: false,
      reason: "active_admin_required",
    });
  });

  it("requires an ACTIVE selected Hospital for report and export capabilities", () => {
    const hospitalInput = {
      capability: GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      targetHospitalId: "11111111-1111-4111-8111-111111111111",
      targetHospitalStatus: HospitalStatus.ACTIVE,
    };
    expect(decide(hospitalInput)).toMatchObject({ allowed: true });
    expect(decide({ ...hospitalInput, targetHospitalStatus: HospitalStatus.SUSPENDED })).toMatchObject({
      allowed: false,
      reason: "active_hospital_required",
    });
    expect(decide({ ...hospitalInput, targetHospitalStatus: HospitalStatus.PENDING_VERIFICATION })).toMatchObject({
      allowed: false,
      reason: "active_hospital_required",
    });
    expect(decide({ ...hospitalInput, targetHospitalId: "not-a-uuid" })).toMatchObject({
      allowed: false,
      reason: "invalid_target_hospital",
    });
  });

  it("rejects capabilities outside the Global Reporting contract", () => {
    expect(decide({ capability: "hospital:report:export" })).toMatchObject({
      allowed: false,
      reason: "invalid_capability",
    });
  });
});
