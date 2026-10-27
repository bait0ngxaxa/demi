import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  WorkforceActivationOperationState,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { selfRegistrationEligibilityInternals } from "./self-registration-eligibility";

type UserState = NonNullable<Parameters<typeof selfRegistrationEligibilityInternals.readEligibility>[0]>;
type Membership = UserState["memberships"][number];
type OsmRelationship = UserState["osmHospitalRelationships"][number];
type PatientProfile = NonNullable<UserState["person"]["patientProfile"]>;
type PatientRelationship = PatientProfile["hospitalRelationships"][number];

const now = new Date("2026-10-22T03:00:00.000Z");
const createdAt = new Date("2026-10-10T03:00:00.000Z");
const hospital = { status: HospitalStatus.ACTIVE, selfRegistrationEnabled: true };

function membership(input: Partial<Membership> = {}): Membership {
  return {
    id: "membership-1",
    hospitalId: "hospital-1",
    membershipType: MembershipType.MEMBER,
    status: MembershipStatus.PROVISIONED,
    createdAt,
    selfRegisteredAt: null,
    hospital,
    ...input,
  };
}

function osmRelationship(input: Partial<OsmRelationship> = {}): OsmRelationship {
  return {
    id: "osm-1",
    hospitalId: "hospital-1",
    status: MembershipStatus.PROVISIONED,
    createdAt,
    selfRegisteredAt: null,
    hospital,
    ...input,
  };
}

function patientRelationship(input: Partial<PatientRelationship> = {}): PatientRelationship {
  return {
    id: "patient-relationship-1",
    hospitalId: "hospital-1",
    createdAt,
    endedAt: null,
    selfRegisteredAt: null,
    hospital,
    ...input,
  };
}

function user(input: Partial<UserState> = {}): UserState {
  return {
    id: "user-1",
    status: UserStatus.PROVISIONED,
    authSubject: null,
    roles: [],
    memberships: [],
    osmHospitalRelationships: [],
    person: { patientProfile: null },
    workforceActivations: [],
    patientActivations: [],
    accountRecoveries: [],
    ...input,
  };
}

function evaluate(value: UserState | null, identityKeyHash: string | null = "identity-hash") {
  return selfRegistrationEligibilityInternals.readEligibility(
    value,
    identityKeyHash,
    { givenName: "สมชาย", familyName: "ทดสอบ" },
    now,
  );
}

describe("self-registration eligibility", () => {
  it.each([
    ["Hospital MEMBER", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership()] }), "HOSPITAL_MEMBER"],
    ["OSM", user({ roles: [{ role: Role.OSM }], osmHospitalRelationships: [osmRelationship()] }), "OSM"],
    ["Patient", user({ roles: [{ role: Role.PATIENT }], person: { patientProfile: { id: "profile-1", hospitalRelationships: [patientRelationship()] } } }), "PATIENT"],
  ] as const)("accepts an eligible pre-provisioned %s", (_label, target, expectedKind) => {
    const result = evaluate(target);
    expect(result.outcome).toBe("ELIGIBLE");
    if (result.outcome === "ELIGIBLE") {
      expect(result.relationships.map(({ kind }) => kind)).toEqual([expectedKind]);
    }
  });

  it.each(["HOSPITAL", "OSM"] as const)("keeps Patient + %s self-registration supported", (kind) => {
    const result = evaluate(user({
      roles: [{ role: Role.PATIENT }, { role: kind }],
      memberships: kind === "HOSPITAL" ? [membership()] : [],
      osmHospitalRelationships: kind === "OSM" ? [osmRelationship()] : [],
      person: { patientProfile: { id: "profile-1", hospitalRelationships: [patientRelationship()] } },
    }));
    expect(result).toMatchObject({ outcome: "ELIGIBLE" });
    if (result.outcome === "ELIGIBLE") expect(result.relationships.map(({ kind }) => kind).sort())
      .toEqual(kind === "HOSPITAL" ? ["HOSPITAL_MEMBER", "PATIENT"] : ["OSM", "PATIENT"]);
  });

  it.each([MembershipStatus.ACTIVE, MembershipStatus.PROVISIONED, MembershipStatus.INVITED, MembershipStatus.SUSPENDED])("fails closed on mixed relationships even without roles: %s", (status) => {
    expect(evaluate(user({ roles: [{ role: Role.OSM }], memberships: [membership({ status })], osmHospitalRelationships: [osmRelationship()] })))
      .toEqual({ outcome: "NOT_FOUND" });
  });

  it.each([
    ["OWNER active membership", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE })] })],
    ["OWNER provisioned membership", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ membershipType: MembershipType.OWNER })] })],
    ["ADMIN role", user({ roles: [{ role: Role.ADMIN }, { role: Role.HOSPITAL }], memberships: [membership()] })],
    ["suspended membership", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ status: MembershipStatus.SUSPENDED })] })],
    ["ended membership", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ status: MembershipStatus.ENDED })] })],
    ["invited membership", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ status: MembershipStatus.INVITED })] })],
    ["inactive Hospital", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ hospital: { ...hospital, status: HospitalStatus.SUSPENDED } })] })],
    ["disabled Hospital switch", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ hospital: { ...hospital, selfRegistrationEnabled: false } })] })],
    ["older than 30 days", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000 - 1) })] })],
    ["future-dated relationship", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership({ createdAt: new Date(now.getTime() + 1) })] })],
    ["mapped credential", user({ roles: [{ role: Role.HOSPITAL }], memberships: [membership()], authSubject: "provider-subject" })],
    ["quarantined workforce claim", user({
      roles: [{ role: Role.HOSPITAL }],
      memberships: [membership()],
      workforceActivations: [{ id: "activation-1", claimedAt: null, usedAt: null, reconciliationRequiredAt: null, operationState: WorkforceActivationOperationState.PROVIDER_STARTED }],
    })],
    ["claimed patient activation", user({
      roles: [{ role: Role.HOSPITAL }],
      memberships: [membership()],
      patientActivations: [{ id: "patient-activation-1", claimedAt: now, usedAt: null, reconciliationRequiredAt: null }],
    })],
    ["unresolved recovery claim", user({
      roles: [{ role: Role.HOSPITAL }],
      memberships: [membership()],
      accountRecoveries: [{ claimedAt: now, completedAt: null, reconciliationRequiredAt: null }],
    })],
  ] as const)("fails closed for %s", (_label, target) => {
    expect(evaluate(target)).toEqual({ outcome: "NOT_FOUND" });
  });

  it("returns ALREADY_ACTIVE only for an active account with a provider mapping", () => {
    expect(evaluate(user({ status: UserStatus.ACTIVE, authSubject: "provider-subject" }))).toEqual({ outcome: "ALREADY_ACTIVE" });
    expect(evaluate(user({ status: UserStatus.SUSPENDED, authSubject: "provider-subject", roles: [{ role: Role.HOSPITAL }], memberships: [membership()] }))).toEqual({ outcome: "NOT_FOUND" });
    expect(evaluate(null)).toEqual({ outcome: "NOT_FOUND" });
    expect(evaluate(user(), null)).toEqual({ outcome: "NOT_FOUND" });
  });

  it("does not reveal a CAREGIVER-only account through national-ID registration lookup", () => {
    expect(evaluate(user({
      status: UserStatus.ACTIVE,
      authSubject: "provider-subject",
      roles: [{ role: Role.CAREGIVER }],
    }))).toEqual({ outcome: "NOT_FOUND" });
    expect(evaluate(user({
      status: UserStatus.ACTIVE,
      authSubject: "provider-subject",
      roles: [{ role: Role.CAREGIVER }, { role: Role.PATIENT }],
    }))).toEqual({ outcome: "ALREADY_ACTIVE" });
  });

  it("requires a unique exact relationship binding", () => {
    const relationship = {
      kind: "HOSPITAL_MEMBER" as const,
      id: "00000000-0000-4000-8000-000000000001",
      hospitalId: "00000000-0000-4000-8000-000000000002",
    };
    expect(selfRegistrationEligibilityInternals.selfRegistrationRelationshipsMatch([relationship], [relationship])).toBe(true);
    expect(selfRegistrationEligibilityInternals.selfRegistrationRelationshipsMatch([relationship], [relationship, relationship])).toBe(false);
    expect(selfRegistrationEligibilityInternals.selfRegistrationRelationshipsMatch([relationship], [])).toBe(false);
  });
});
