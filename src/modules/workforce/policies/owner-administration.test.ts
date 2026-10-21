import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { decidePatientProvisioningPolicy, PATIENT_PROVISIONING_CAPABILITY } from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { decidePatientActivationIssuePolicy, PATIENT_ACTIVATION_ISSUE_CAPABILITY } from "@/modules/patient-activation/policies/patient-activation-policy";
import { decidePatientAccessRequestPolicy, PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY } from "@/modules/patient-access-requests/policies/patient-access-request-policy";
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

const operations: { name: string; allows: (subject: ActorContext, targetHospitalId: string) => boolean }[] = [
  ...Object.values(WORKFORCE_CAPABILITIES).map((capability) => ({ name: capability, allows: (subject: ActorContext, targetHospitalId: string): boolean => decideWorkforcePolicy({ actor: subject, targetHospitalId, capability }).allowed })),
  { name: "patient import", allows: (subject, targetHospitalId) => decidePatientProvisioningPolicy({ actor: subject, targetHospitalId, capability: PATIENT_PROVISIONING_CAPABILITY }).allowed },
  { name: "patient activation", allows: (subject, targetHospitalId) => decidePatientActivationIssuePolicy({ actor: subject, targetHospitalId, capability: PATIENT_ACTIVATION_ISSUE_CAPABILITY }).allowed },
  { name: "account request review", allows: (subject, targetHospitalId) => decidePatientAccessRequestPolicy({ actor: subject, hospitalId: targetHospitalId, capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY }).allowed },
  ...[PATIENT_SERVICE_REQUEST_CAPABILITIES.review, PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog].map((capability) => ({ name: capability, allows: (subject: ActorContext, targetHospitalId: string): boolean => decidePatientServiceRequestPolicy({ actor: subject, hospitalId: targetHospitalId, capability }).allowed })),
  // Report export is not OWNER-only (Product Owner decision 2026-10-21); it is covered separately below.
  ...[HOSPITAL_REPORT_CAPABILITIES.dashboardRead, HOSPITAL_REPORT_CAPABILITIES.rowRead].map((capability) => ({ name: capability, allows: (subject: ActorContext, targetHospitalId: string): boolean => decideHospitalReportPolicy({ actor: subject, capability, target: { hospitalId: targetHospitalId, hospitalStatus: HospitalStatus.ACTIVE } }).allowed })),
];

const allowsExport = (subject: ActorContext, targetHospitalId: string): boolean =>
  decideHospitalReportPolicy({ actor: subject, capability: HOSPITAL_REPORT_CAPABILITIES.export, target: { hospitalId: targetHospitalId, hospitalStatus: HospitalStatus.ACTIVE } }).allowed;

describe.each(operations)("Owner administration: $name", ({ allows }) => {
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
    const subject = actor();
    expect(allows({ ...subject, hospitalMemberships: subject.hospitalMemberships.map((membership) => ({ ...membership, status })) }, hospitalId)).toBe(false);
  });

  it("denies a suspended Hospital", () => {
    const subject = actor();
    expect(allows({ ...subject, hospitalMemberships: subject.hospitalMemberships.map((membership) => ({ ...membership, hospitalStatus: HospitalStatus.SUSPENDED })) }, hospitalId)).toBe(false);
  });
});

describe("Report export: OWNER and every ACTIVE MEMBER of the exact Hospital", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])("allows an ACTIVE %s of the exact Hospital", (membershipType) => {
    expect(allowsExport(actor(membershipType), hospitalId)).toBe(true);
    expect(allowsExport({ ...actor(membershipType), hospitalMemberships: actor(membershipType).hospitalMemberships.map((membership) => ({ ...membership, reportExportGranted: false })) }, hospitalId)).toBe(true);
  });

  it("does not inherit export from a membership at another Hospital", () => {
    for (const membershipType of [MembershipType.OWNER, MembershipType.MEMBER]) {
      expect(allowsExport(actor(membershipType), otherHospitalId)).toBe(false);
    }
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN])("denies %s-only identities", (role) => {
    expect(allowsExport({ ...actor(MembershipType.MEMBER), roles: [role] }, hospitalId)).toBe(false);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED, MembershipStatus.ENDED])("denies a %s MEMBER", (status) => {
    const subject = actor(MembershipType.MEMBER);
    expect(allowsExport({ ...subject, hospitalMemberships: subject.hospitalMemberships.map((membership) => ({ ...membership, status })) }, hospitalId)).toBe(false);
  });

  it("denies a MEMBER of a suspended Hospital", () => {
    const subject = actor(MembershipType.MEMBER);
    expect(allowsExport({ ...subject, hospitalMemberships: subject.hospitalMemberships.map((membership) => ({ ...membership, hospitalStatus: HospitalStatus.SUSPENDED })) }, hospitalId)).toBe(false);
  });
});
