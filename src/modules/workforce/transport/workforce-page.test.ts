import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkforcePage from "../../../../app/app/workforce/page";

const {
  mockedConnection,
  mockedGetProtectedApplicationActor,
  mockedListWorkforce,
  mockedListWorkforceOwnerHospitals,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedListWorkforce: vi.fn(),
  mockedListWorkforceOwnerHospitals: vi.fn(),
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

vi.mock("@/modules/workforce/services/workforce-service", () => ({
  listWorkforce: mockedListWorkforce,
  listWorkforceOwnerHospitals: mockedListWorkforceOwnerHospitals,
}));

const hospitals = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "HOSPITAL-A",
    name: "โรงพยาบาล ก",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    hospitalCode: "HOSPITAL-B",
    name: "โรงพยาบาล ข",
  },
];

describe("Workforce page Hospital context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "actor" });
    mockedListWorkforceOwnerHospitals.mockResolvedValue(hospitals);
    mockedListWorkforce.mockResolvedValue({ hospital: hospitals[0], rows: [] });
  });

  it("keys the workspace by the server-validated selected Hospital", async () => {
    const hospitalA = await WorkforcePage({
      searchParams: Promise.resolve({ hospitalId: hospitals[0].id }),
    });
    const hospitalB = await WorkforcePage({
      searchParams: Promise.resolve({ hospitalId: hospitals[1].id }),
    });

    expect(hospitalA.key).toBe(hospitals[0].id);
    expect(hospitalB.key).toBe(hospitals[1].id);
    expect(hospitalB.key).not.toBe(hospitalA.key);
  });

  it("does not use an unauthorized requested Hospital as the workspace key", async () => {
    const invalidHospital = await WorkforcePage({
      searchParams: Promise.resolve({ hospitalId: "not-authorized" }),
    });

    expect(invalidHospital.key).toBe(hospitals[0].id);
    expect(invalidHospital.key).not.toBe("not-authorized");
  });
});
