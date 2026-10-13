import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientProvisioningPage from "../../../../app/app/patients/provision/page";

const {
  mockedConnection,
  mockedGetProtectedApplicationActor,
  mockedListPatientProvisioningScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListPatientProvisioningScopes: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: mockedConnection,
}));

vi.mock("next/navigation", () => ({
  redirect: mockedRedirect,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock("@/modules/patient-provisioning/services/patient-provisioning-service", () => ({
  listPatientProvisioningScopes: mockedListPatientProvisioningScopes,
}));

const scopes = [
  {
    hospitalId: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "HOSPITAL-A",
    hospitalName: "โรงพยาบาล ก",
    canBulkImport: true,
  },
  {
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalCode: "HOSPITAL-B",
    hospitalName: "โรงพยาบาล ข",
    canBulkImport: false,
  },
];

describe("Patient provisioning page Hospital context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "actor",
      personId: "person",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedListPatientProvisioningScopes.mockResolvedValue(scopes);
  });

  it("keys the workspace by the server-validated selected Hospital", async () => {
    const hospitalA = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });
    const hospitalB = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });

    expect(hospitalA.key).toBe(scopes[0].hospitalId);
    expect(hospitalB.key).toBe(scopes[1].hospitalId);
    expect(hospitalB.key).not.toBe(hospitalA.key);
  });

  it("does not use an unauthorized requested Hospital as the workspace key", async () => {
    const invalidHospital = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: "not-authorized" }),
    });

    expect(invalidHospital.key).toBe(scopes[0].hospitalId);
    expect(invalidHospital.key).not.toBe("not-authorized");
  });

  it("offers bulk OSM assignment only to an active OWNER of the selected Hospital", async () => {
    const actorFor = (membershipType: MembershipType) => ({
      userId: "actor",
      personId: "person",
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: scopes[0].hospitalId,
          membershipType,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    });

    mockedGetProtectedApplicationActor.mockResolvedValue(actorFor(MembershipType.OWNER));
    const owner = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });
    const ownerElsewhere = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });
    mockedGetProtectedApplicationActor.mockResolvedValue(actorFor(MembershipType.MEMBER));
    const member = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });

    expect(owner.props.canAssignOsm).toBe(true);
    expect(ownerElsewhere.props.canAssignOsm).toBe(false);
    expect(member.props.canAssignOsm).toBe(false);
  });
});
