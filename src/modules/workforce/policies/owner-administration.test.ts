import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { decidePatientOsmAssignmentPolicy, PATIENT_ASSIGN_OSM_CAPABILITY } from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import { decidePatientProvisioningPolicy, PATIENT_PROVISIONING_CAPABILITY } from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { decidePatientActivationIssuePolicy, PATIENT_ACTIVATION_ISSUE_CAPABILITY } from "@/modules/patient-activation/policies/patient-activation-policy";
import { decidePatientServiceRequestPolicy, PATIENT_SERVICE_REQUEST_CAPABILITIES } from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import { decideHospitalReportPolicy, HOSPITAL_REPORT_CAPABILITIES } from "@/modules/reporting/policies/hospital-report-policy";
import { decideWorkforcePolicy, WORKFORCE_CAPABILITIES } from "./workforce-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";

function actor(membershipType: MembershipType = MembershipType.OWNER): ActorContext {
  return {
    userId: "owner", personId: "person", roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE, reportExportGranted: true }],
    osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  };
}

type Operation = { name: string; allows: (subject: ActorContext, targetHospitalId: string) => boolean };

/** ADR-0026: Hospital management and user management stay with the OWNER. */
const ownerOnlyOperations: Operation[] = [
  ...Object.values(WORKFORCE_CAPABILITIES).map((capability) => ({ name: capability, allows: (subject: ActorContext, targetHospitalId: string): boolean => decideWorkforcePolicy({ actor: subject, targetHospitalId, capability }).allowed })),
  { name: "patient import", allows: (subject, targetHospitalId) => decidePatientProvisioningPolicy({ actor: subject, targetHospitalId, capability: PATIENT_PROVISIONING_CAPABILITY }).allowed },
  { name: "patient activation", allows: (subject, targetHospitalId) => decidePatientActivationIssuePolicy({ actor: subject, targetHospitalId, capability: PATIENT_ACTIVATION_ISSUE_CAPABILITY }).allowed },
  { name: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog, allows: (subject, targetHospitalId) => decidePatientServiceRequestPolicy({ actor: subject, hospitalId: targetHospitalId, capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog }).allowed },
];

/** ADR-0026: operational capabilities every ACTIVE OWNER or MEMBER holds. */
const operatorOperations: Operation[] = [
  { name: PATIENT_SERVICE_REQUEST_CAPABILITIES.review, allows: (subject, targetHospitalId) => decidePatientServiceRequestPolicy({ actor: subject, hospitalId: targetHospitalId, capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review }).allowed },
  { name: PATIENT_ASSIGN_OSM_CAPABILITY, allows: (subject, targetHospitalId) => decidePatientOsmAssignmentPolicy({ actor: subject, targetHospitalId, capability: PATIENT_ASSIGN_OSM_CAPABILITY }).allowed },
  ...Object.values(HOSPITAL_REPORT_CAPABILITIES).map((capability) => ({ name: capability, allows: (subject: ActorContext, targetHospitalId: string): boolean => decideHospitalReportPolicy({ actor: subject, capability, target: { hospitalId: targetHospitalId, hospitalStatus: HospitalStatus.ACTIVE } }).allowed })),
];

function withMembership(subject: ActorContext, overrides: Partial<ActorContext["hospitalMemberships"][number]>): ActorContext {
  return { ...subject, hospitalMemberships: subject.hospitalMemberships.map((membership) => ({ ...membership, ...overrides })) };
}

describe.each(ownerOnlyOperations)("Owner administration: $name", ({ allows }) => {
  it("retains direct OWNER authority for a multi-role identity", () => {
    expect(allows(actor(), hospitalId)).toBe(true);
  });

  it("denies MEMBER even with OSM, PATIENT and a historical export grant", () => {
    expect(allows(actor(MembershipType.MEMBER), hospitalId)).toBe(false);
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN])("denies %s-only identities", (role) => {
    expect(allows({ ...actor(), roles: [role] }, hospitalId)).toBe(false);
  });

  it("does not inherit authority from an unrelated, parent or child Hospital", () => {
    expect(allows(actor(), otherHospitalId)).toBe(false);
    const subject = actor(MembershipType.MEMBER);
    expect(allows({ ...subject, hospitalMemberships: [...subject.hospitalMemberships, { ...actor().hospitalMemberships[0], hospitalId: otherHospitalId }] }, hospitalId)).toBe(false);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED, MembershipStatus.ENDED])("denies %s membership", (status) => {
    expect(allows(withMembership(actor(), { status }), hospitalId)).toBe(false);
  });

  it("denies a suspended Hospital", () => {
    expect(allows(withMembership(actor(), { hospitalStatus: HospitalStatus.SUSPENDED }), hospitalId)).toBe(false);
  });
});

describe.each(operatorOperations)("MEMBER operational parity: $name", ({ allows }) => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])("allows an ACTIVE %s of the exact Hospital, with or without a historical grant", (membershipType) => {
    expect(allows(actor(membershipType), hospitalId)).toBe(true);
    expect(allows(withMembership(actor(membershipType), { reportExportGranted: false }), hospitalId)).toBe(true);
  });

  it("does not inherit authority from a membership at another Hospital", () => {
    for (const membershipType of [MembershipType.OWNER, MembershipType.MEMBER]) {
      expect(allows(actor(membershipType), otherHospitalId)).toBe(false);
    }
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN])("denies %s-only identities", (role) => {
    expect(allows({ ...actor(MembershipType.MEMBER), roles: [role] }, hospitalId)).toBe(false);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED, MembershipStatus.ENDED])("denies a %s MEMBER", (status) => {
    expect(allows(withMembership(actor(MembershipType.MEMBER), { status }), hospitalId)).toBe(false);
  });

  it("denies a MEMBER of a suspended Hospital", () => {
    expect(allows(withMembership(actor(MembershipType.MEMBER), { hospitalStatus: HospitalStatus.SUSPENDED }), hospitalId)).toBe(false);
  });
});
