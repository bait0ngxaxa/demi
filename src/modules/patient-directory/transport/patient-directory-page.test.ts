import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientDirectoryPage from "../../../../app/app/patients/page";
import { ValidationError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedFindPatientDirectory,
  mockedGetPatientClassificationCounts,
  mockedGetProtectedApplicationActor,
  mockedListPatientDirectoryScopes,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedFindPatientDirectory: vi.fn(),
  mockedGetPatientClassificationCounts: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListPatientDirectoryScopes: vi.fn(),
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

vi.mock("@/modules/patient-directory/services/patient-directory-query-service", () => ({
  findPatientDirectory: mockedFindPatientDirectory,
  listPatientDirectoryScopes: mockedListPatientDirectoryScopes,
}));
vi.mock("@/modules/patient-classification/services/patient-classification-query-service", () => ({
  getPatientClassificationCounts: mockedGetPatientClassificationCounts,
}));

const scopes = [
  {
    hospitalId: "11111111-1111-4111-8111-111111111111",
    hospitalName: "โรงพยาบาล ก",
    access: "DIRECT" as const,
  },
  {
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalName: "โรงพยาบาล ข",
    access: "DIRECT" as const,
  },
];

const result = {
  hospital: scopes[0],
  items: [],
  lookupType: "NAME" as const,
  value: "",
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

describe("Patient Directory page Hospital context", () => {
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
    mockedListPatientDirectoryScopes.mockResolvedValue(scopes);
    mockedFindPatientDirectory.mockResolvedValue(result);
    mockedGetPatientClassificationCounts.mockResolvedValue({
      total: 0,
      risk: 0,
      diabetes: 0,
      unclassified: 0,
    });
    mockedRedirect.mockImplementation((location: string): never => {
      throw new Error(`REDIRECT:${location}`);
    });
  });

  it("uses the server-validated Hospital as the workspace key and query context", async () => {
    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });

    expect(page.key).toBe(scopes[1].hospitalId);
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[1].hospitalId }),
    );
  });

  it("uses the first authorized Hospital when no Hospital context is provided", async () => {
    const page = await PatientDirectoryPage({ searchParams: Promise.resolve({}) });

    expect(page.key).toBe(scopes[0].hospitalId);
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
  });

  it.each(["screening", "followup", "service"] as const)("accepts the %s direct Hospital task mode", async (task) => {
    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId, task }),
    });

    expect(page.props.taskMode).toBe(task);
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
  });

  it("ignores an invalid task without changing the directory query", async () => {
    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId, task: "import" }),
    });

    expect(page.props.taskMode).toBeNull();
    expect(mockedFindPatientDirectory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
  });

  it("does not activate a write-oriented task for a read-only network scope", async () => {
    mockedListPatientDirectoryScopes.mockResolvedValue([
      { ...scopes[0], access: "NETWORK" },
    ]);

    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId, task: "screening" }),
    });

    expect(page.props.taskMode).toBeNull();
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
    const owner = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });
    const ownerElsewhere = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[1].hospitalId }),
    });
    mockedGetProtectedApplicationActor.mockResolvedValue(actorFor(MembershipType.MEMBER));
    const member = await PatientDirectoryPage({
      searchParams: Promise.resolve({ hospitalId: scopes[0].hospitalId }),
    });

    expect(owner.props.canAssignOsm).toBe(true);
    expect(ownerElsewhere.props.canAssignOsm).toBe(false);
    expect(member.props.canAssignOsm).toBe(false);
  });

  it("redirects an invalid explicit Hospital context without querying another Hospital", async () => {
    const forgedHospitalId = "33333333-3333-4333-8333-333333333333";

    await expect(
      PatientDirectoryPage({
        searchParams: Promise.resolve({ hospitalId: forgedHospitalId }),
      }),
    ).rejects.toThrow("REDIRECT:/app/patients");

    expect(mockedRedirect).toHaveBeenCalledWith("/app/patients");
    expect(mockedFindPatientDirectory).not.toHaveBeenCalled();
    expect(mockedFindPatientDirectory).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: scopes[0].hospitalId }),
    );
    expect(mockedFindPatientDirectory).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetHospitalId: forgedHospitalId }),
    );
  });

  it("renders a safe validation state for a bounded query error", async () => {
    mockedFindPatientDirectory.mockRejectedValue(new ValidationError());

    const page = await PatientDirectoryPage({
      searchParams: Promise.resolve({
        hospitalId: scopes[0].hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
      }),
    });

    expect(page.props).toMatchObject({
      errorMessage: "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองใหม่อีกครั้ง",
      result: null,
    });
  });
});
