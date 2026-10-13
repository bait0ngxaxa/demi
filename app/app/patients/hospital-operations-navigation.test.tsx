import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PatientDirectoryView } from "./patient-directory-view";
import { PatientActivationActionsWorkspace } from "./activation/patient-activation-actions-workspace";
import { HospitalServiceCatalogWorkspace } from "./service-catalog/hospital-service-catalog-workspace";
import { HospitalPatientAccessRequestsWorkspace } from "./access-requests/patient-access-requests-workspace";

const scopes = [
  { hospitalId: "11111111-1111-4111-8111-111111111111", hospitalName: "โรงพยาบาล ก", hospitalCode: "H-A" },
  { hospitalId: "22222222-2222-4222-8222-222222222222", hospitalName: "โรงพยาบาล ข", hospitalCode: "H-B" },
];
const scope = scopes[1];

describe("Hospital patient operations navigation", () => {
  it("returns the directory to the selected Hospital without changing relationship destinations", () => {
    const html = renderToStaticMarkup(<PatientDirectoryView scopes={scopes} selectedScope={scope} classificationFilter="ALL" classificationCounts={{ total: 1, risk: 0, diabetes: 0, unclassified: 1 }} lookupType="NAME" value="" errorMessage={null} result={{
      hospital: scope, items: [{ patientHospitalRelationshipId: "exact-relationship", patientProfileId: "patient-profile", displayName: "ผู้ป่วย", hospital: { id: scope.hospitalId, name: scope.hospitalName }, hospitalNumber: "HN-B", classification: null }],
      lookupType: "NAME", value: "", classificationFilter: "ALL", page: 1, pageSize: 25, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false,
    }} />);
    expect(html).toContain(`href="/app#hospital-workspace-${scope.hospitalId}"`);
    expect(html).toContain('href="/app/patients/exact-relationship"');
    expect(html).toContain("HN-B");
    expect(html).not.toContain(`/app/patients?hospitalId=${scopes[0].hospitalId}`);
  });

  it("keeps activation search and return in the exact selected Hospital", () => {
    const html = renderToStaticMarkup(<PatientActivationActionsWorkspace scopes={scopes} selectedScope={scope} selectedHospitalId={scope.hospitalId} />);
    expect(html).toContain(`href="/app#hospital-workspace-${scope.hospitalId}"`);
    expect(html).toContain(`href="/app/patients?hospitalId=${scope.hospitalId}"`);
    expect(html).toContain(`name="targetHospitalId" value="${scope.hospitalId}"`);
    expect(html).toContain("ผู้ป่วยเป็นผู้ตั้งรหัสผ่านเอง");
  });

  it("shows catalog Hospitals separately and describes its actor-wide scope", () => {
    const html = renderToStaticMarkup(<HospitalServiceCatalogWorkspace catalogs={scopes.map((item) => ({ ...item, offerings: [] }))} />);
    expect(html).toContain("โรงพยาบาล ก");
    expect(html).toContain("โรงพยาบาล ข");
    expect(html).toContain("แต่ละรายการบันทึกแยกตามโรงพยาบาล");
    expect(html).toContain("ไม่สร้าง Program หรือมอบหมาย อสม.");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain('href="/app/patients/service-catalog?hospitalId=');
  });

  it("distinguishes the all-authorized-Hospital request queue from exact Hospital lookup", () => {
    const html = renderToStaticMarkup(<HospitalPatientAccessRequestsWorkspace requests={[]} hospitals={scopes.map((item) => ({ id: item.hospitalId, name: item.hospitalName, hospitalCode: item.hospitalCode }))} />);
    expect(html).toContain("รวมคำขอจากทุกโรงพยาบาล");
    expect(html).toContain("ใช้กับการค้นหานั้นเท่านั้น");
    expect(html).toContain("ยังไม่มีคำขอ");
    expect(html).toContain('href="/app"');
    expect(html).not.toContain("งานค้าง");
  });
});
