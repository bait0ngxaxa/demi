import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  redirect: vi.fn(),
  getActor: vi.fn(),
  listScopes: vi.fn(),
  decideAssignment: vi.fn(),
  renderWorkspace: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("@/modules/patient-provisioning/services/patient-provisioning-service", () => ({
  listPatientProvisioningScopes: mocks.listScopes,
}));
vi.mock("@/modules/patient-assignment/policies/patient-osm-assignment-policy", () => ({
  decidePatientOsmAssignmentPolicy: mocks.decideAssignment,
  PATIENT_ASSIGN_OSM_CAPABILITY: "patient:assign-osm",
}));
vi.mock("./patient-provisioning-workspace", () => ({
  PatientProvisioningWorkspace: (props: unknown) => {
    mocks.renderWorkspace(props);
    return null;
  },
}));

import PatientProvisioningPage from "./page";

const osmActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Patient provisioning page navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getActor.mockResolvedValue(osmActor);
    mocks.listScopes.mockResolvedValue([]);
    mocks.decideAssignment.mockReturnValue({ allowed: false });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("explains when an OSM has no current eligible Hospital context", async () => {
    const markup = renderToStaticMarkup(await PatientProvisioningPage({
      searchParams: Promise.resolve({}),
    }));

    expect(markup).toContain("ไม่พบโรงพยาบาลที่เปิดให้ดำเนินการ");
    expect(markup).toContain("ไม่มีขอบเขตโรงพยาบาลที่ใช้งานได้");
    expect(markup).toContain('href="/app"');
    expect(mocks.renderWorkspace).not.toHaveBeenCalled();
  });

  it("keeps multiple current scopes visible and ignores a stale Hospital selection", async () => {
    const scopes = [
      { hospitalId: "hospital-1", hospitalCode: "H-001", hospitalName: "โรงพยาบาล ก", canBulkImport: false },
      { hospitalId: "hospital-2", hospitalCode: "H-002", hospitalName: "โรงพยาบาล ข", canBulkImport: false },
    ];
    mocks.listScopes.mockResolvedValue(scopes);

    const element = await PatientProvisioningPage({
      searchParams: Promise.resolve({ hospitalId: "stale-hospital" }),
    });

    expect(element.props).toMatchObject({
      scopes,
      selectedHospitalId: "hospital-1",
      selectedScope: scopes[0],
    });
  });

  it("does not offer the empty provisioning screen to unrelated roles", async () => {
    mocks.getActor.mockResolvedValue({ ...osmActor, roles: [Role.PATIENT] });

    await expect(PatientProvisioningPage({
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("REDIRECT:/app");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });
});
