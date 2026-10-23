import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
  decideAppointmentPolicy,
} from "@/modules/appointments/policies/appointment-policy";
import type { ActorContext, ActorHospitalMembership } from "@/modules/auth/types/actor-context";
import {
  decidePatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import { decideWorkforcePolicy, WORKFORCE_CAPABILITIES } from "@/modules/workforce/policies/workforce-policy";

import {
  decideHospitalNetworkChildReportPolicy,
  HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES,
  type HospitalNetworkChildReportHierarchy,
} from "./hospital-network-child-report-policy";
import { decideHospitalReportPolicy, HOSPITAL_REPORT_CAPABILITIES } from "./hospital-report-policy";

/**
 * ADR-0013 §8 authorization contract, expressed against the pure policies each operation uses. Database-resolved
 * parts (current direct link, ended Patient relationships, audit) are covered by the RPT-32 export service test.
 */
const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const siblingId = "33333333-3333-4333-8333-333333333333";
const otherParentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";

const NETWORK = HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES;

function membership(
  hospitalId: string,
  membershipType: MembershipType,
  overrides: Partial<ActorHospitalMembership> = {},
): ActorHospitalMembership {
  return {
    hospitalId,
    membershipType,
    profession: membershipType === MembershipType.MEMBER ? Profession.NURSE : null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
    ...overrides,
  };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId,
    personId: "66666666-6666-4666-8666-666666666666",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function hierarchy(overrides: {
  parent?: Partial<HospitalNetworkChildReportHierarchy["parent"]>;
  child?: Partial<HospitalNetworkChildReportHierarchy["child"]>;
} = {}): HospitalNetworkChildReportHierarchy {
  return {
    parent: { id: parentId, status: HospitalStatus.ACTIVE, parentHospitalId: null, ...overrides.parent },
    child: { id: childId, status: HospitalStatus.ACTIVE, parentHospitalId: parentId, ...overrides.child },
    issues: [],
  };
}

const parentOwner = actor({ hospitalMemberships: [membership(parentId, MembershipType.OWNER)] });
const parentMember = actor({ hospitalMemberships: [membership(parentId, MembershipType.MEMBER)] });
const parentMemberWithGrant = actor({
  hospitalMemberships: [membership(parentId, MembershipType.MEMBER, { reportExportGranted: true })],
});
const childOwner = actor({ hospitalMemberships: [membership(childId, MembershipType.OWNER)] });
const childMember = actor({ hospitalMemberships: [membership(childId, MembershipType.MEMBER)] });
const childMemberWithGrant = actor({
  hospitalMemberships: [membership(childId, MembershipType.MEMBER, { reportExportGranted: true })],
});
const childOsm = actor({
  roles: [Role.OSM],
  osmHospitalRelationships: [{ hospitalId: childId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
});

const networkAllowed = (subject: ActorContext, capability: string, target = hierarchy()) =>
  decideHospitalNetworkChildReportPolicy({ actor: subject, capability, hierarchy: target }).allowed;
const hospitalReport = (subject: ActorContext, capability: string, hospitalId: string) =>
  decideHospitalReportPolicy({ actor: subject, capability, target: { hospitalId, hospitalStatus: HospitalStatus.ACTIVE } }).allowed;
const workforce = (subject: ActorContext, capability: string, hospitalId: string) =>
  decideWorkforcePolicy({ actor: subject, capability, targetHospitalId: hospitalId }).allowed;
const patientRead = (subject: ActorContext, hospitalId: string) =>
  decidePatientReadPolicy({ actor: subject, capability: PATIENT_READ_CAPABILITY, targetHospitalId: hospitalId }).allowed;
const appointment = (subject: ActorContext, capability: string, hospitalId: string, assignedOsmUserId: string | null = null) =>
  decideAppointmentPolicy({
    actor: subject,
    capability,
    target: {
      hospitalId,
      hospitalStatus: HospitalStatus.ACTIVE,
      patientCurrentOsmUserId: assignedOsmUserId,
      assignedOsmAssignmentId: assignedOsmUserId ? "77777777-7777-4777-8777-777777777777" : null,
      patientUserId: null,
    },
  }).allowed;

describe("ADR-0013 §8 responsibility-area authorization matrix", () => {
  describe("active Parent OWNER", () => {
    it("allows own active Parent context under existing direct OWNER policies", () => {
      expect(hospitalReport(parentOwner, HOSPITAL_REPORT_CAPABILITIES.dashboardRead, parentId)).toBe(true);
      expect(workforce(parentOwner, WORKFORCE_CAPABILITIES.read, parentId)).toBe(true);
      expect(patientRead(parentOwner, parentId)).toBe(true);
    });

    it("allows reading and exporting (RPT-32) the exact active direct Child's summary", () => {
      expect(networkAllowed(parentOwner, NETWORK.read)).toBe(true);
      expect(networkAllowed(parentOwner, NETWORK.export)).toBe(true);
    });

    it("denies Child Patient rows, care detail and appointment writes", () => {
      expect(patientRead(parentOwner, childId)).toBe(false);
      expect(hospitalReport(parentOwner, HOSPITAL_REPORT_CAPABILITIES.rowRead, childId)).toBe(false);
      expect(hospitalReport(parentOwner, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(false);
      expect(appointment(parentOwner, APPOINTMENT_READ_CAPABILITY, childId)).toBe(false);
      expect(appointment(parentOwner, APPOINTMENT_MANAGE_CAPABILITY, childId)).toBe(false);
    });

    it("denies reading the Child workforce roster or adding/ending Child staff or OSMs (ADR-0008)", () => {
      for (const capability of Object.values(WORKFORCE_CAPABILITIES)) {
        expect(workforce(parentOwner, capability, childId)).toBe(false);
      }
    });

    it.each([
      ["sibling (another Parent's Child)", hierarchy({ child: { id: siblingId, parentHospitalId: otherParentId } })],
      ["grandchild (Parent itself is subordinate)", hierarchy({ parent: { parentHospitalId: otherParentId } })],
      ["unrelated Hospital", hierarchy({ child: { id: siblingId, parentHospitalId: null } })],
      ["inactive Child", hierarchy({ child: { status: HospitalStatus.SUSPENDED } })],
      ["pending Child", hierarchy({ child: { status: HospitalStatus.PENDING_VERIFICATION } })],
      ["reparented/detached Child", hierarchy({ child: { parentHospitalId: otherParentId } })],
      ["inactive Parent", hierarchy({ parent: { status: HospitalStatus.SUSPENDED } })],
    ])("denies read and export for a %s", (_label, target) => {
      expect(networkAllowed(parentOwner, NETWORK.read, target)).toBe(false);
      expect(networkAllowed(parentOwner, NETWORK.export, target)).toBe(false);
    });
  });

  describe("active Parent MEMBER", () => {
    it("denies Child work selection, Child summary and Child export with only a Parent membership", () => {
      expect(networkAllowed(parentMember, NETWORK.read)).toBe(false);
      expect(networkAllowed(parentMember, NETWORK.export)).toBe(false);
      expect(patientRead(parentMember, childId)).toBe(false);
      expect(workforce(parentMember, WORKFORCE_CAPABILITIES.osmRead, childId)).toBe(false);
    });

    // Product Owner decision 2026-10-21: a MEMBER exports its own Hospital only; grants add nothing.
    it("exports only its own Parent Hospital, never a Child or the network", () => {
      expect(hospitalReport(parentMemberWithGrant, HOSPITAL_REPORT_CAPABILITIES.export, parentId)).toBe(true);
      expect(hospitalReport(parentMemberWithGrant, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(false);
      expect(networkAllowed(parentMemberWithGrant, NETWORK.export)).toBe(false);
    });
  });

  describe("active Child OWNER", () => {
    it("allows current direct Child patient, workforce and report policies", () => {
      expect(patientRead(childOwner, childId)).toBe(true);
      expect(workforce(childOwner, WORKFORCE_CAPABILITIES.create, childId)).toBe(true);
      expect(hospitalReport(childOwner, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(true);
    });

    it("denies upward Parent and sibling data, including the Parent-to-Child path", () => {
      for (const hospitalId of [parentId, siblingId]) {
        expect(patientRead(childOwner, hospitalId)).toBe(false);
        expect(workforce(childOwner, WORKFORCE_CAPABILITIES.read, hospitalId)).toBe(false);
        expect(hospitalReport(childOwner, HOSPITAL_REPORT_CAPABILITIES.dashboardRead, hospitalId)).toBe(false);
      }
      // Child OWNER naming the real Parent: not the Parent's OWNER.
      expect(networkAllowed(childOwner, NETWORK.export, hierarchy({ child: { id: siblingId } }))).toBe(false);
      // Child OWNER using its own Child as the "Parent": a subordinate is never a Parent scope.
      expect(networkAllowed(childOwner, NETWORK.export, hierarchy({
        parent: { id: childId, parentHospitalId: parentId },
        child: { id: siblingId, parentHospitalId: childId },
      }))).toBe(false);
    });
  });

  describe("active Child MEMBER", () => {
    it("allows own Child capabilities where that operation's policy allows", () => {
      expect(patientRead(childMember, childId)).toBe(true);
      expect(workforce(childMember, WORKFORCE_CAPABILITIES.osmRead, childId)).toBe(false);
      expect(workforce(childMember, WORKFORCE_CAPABILITIES.create, childId)).toBe(false);
    });

    it("exports its own Child Hospital with or without a historical grant", () => {
      expect(hospitalReport(childMember, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(true);
      expect(hospitalReport(childMemberWithGrant, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(true);
      expect(hospitalReport(childMember, HOSPITAL_REPORT_CAPABILITIES.dashboardRead, childId)).toBe(false);
    });

    it("denies using the membership or grant to read/export another Hospital", () => {
      for (const hospitalId of [parentId, siblingId]) {
        expect(hospitalReport(childMemberWithGrant, HOSPITAL_REPORT_CAPABILITIES.export, hospitalId)).toBe(false);
        expect(patientRead(childMemberWithGrant, hospitalId)).toBe(false);
      }
      expect(networkAllowed(childMemberWithGrant, NETWORK.export)).toBe(false);
    });
  });

  describe("active OSM", () => {
    it("allows assigned Patient work only with an exact Child relationship and active assignment", () => {
      expect(appointment(childOsm, APPOINTMENT_READ_CAPABILITY, childId, userId)).toBe(true);
      expect(appointment(childOsm, APPOINTMENT_READ_CAPABILITY, childId, null)).toBe(false);
    });

    it("denies Parent, sibling or another Child's Patient relationship", () => {
      for (const hospitalId of [parentId, siblingId]) {
        expect(appointment(childOsm, APPOINTMENT_READ_CAPABILITY, hospitalId, userId)).toBe(false);
      }
      expect(networkAllowed(childOsm, NETWORK.read)).toBe(false);
    });
  });

  describe("revoked or inactive scope", () => {
    it.each([
      ["suspended Parent OWNER membership", membership(parentId, MembershipType.OWNER, { status: MembershipStatus.SUSPENDED })],
      ["ended Parent OWNER membership", membership(parentId, MembershipType.OWNER, { status: MembershipStatus.ENDED })],
      ["inactive Parent Hospital on the membership", membership(parentId, MembershipType.OWNER, { hospitalStatus: HospitalStatus.SUSPENDED })],
    ])("denies continued report/export after a %s", (_label, revoked) => {
      const subject = actor({ hospitalMemberships: [revoked] });
      expect(networkAllowed(subject, NETWORK.read)).toBe(false);
      expect(networkAllowed(subject, NETWORK.export)).toBe(false);
    });

    it("does not depend on a ก-15 grant: revoking one leaves own-Hospital export unchanged", () => {
      expect(hospitalReport(childMember, HOSPITAL_REPORT_CAPABILITIES.export, childId)).toBe(true);
    });
  });

  it("denies a Platform ADMIN without a qualifying Parent OWNER membership on the Parent-to-Child path", () => {
    const admin = actor({ roles: [Role.ADMIN] });
    expect(networkAllowed(admin, NETWORK.read)).toBe(false);
    expect(networkAllowed(admin, NETWORK.export)).toBe(false);
    expect(networkAllowed({ ...admin, hospitalMemberships: parentOwner.hospitalMemberships }, NETWORK.export)).toBe(false);
  });
});
