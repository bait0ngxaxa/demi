import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PatientDirectoryPage, PatientDirectoryScope } from "@/modules/patient-directory/services/patient-directory-query-service";

import { PatientDirectoryView } from "./patient-directory-view";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const directScope: PatientDirectoryScope = {
  hospitalId,
  hospitalName: "โรงพยาบาล ก",
  access: "DIRECT",
};

const result: PatientDirectoryPage = {
  hospital: directScope,
  items: [{
    patientProfileId: "33333333-3333-4333-8333-333333333333",
    patientHospitalRelationshipId: patientId,
    displayName: "สมชาย ผู้ป่วย",
    hospital: { id: hospitalId, name: directScope.hospitalName },
    hospitalNumber: "HN-001",
    classification: null,
    selfRegisteredAt: null,
  }],
  lookupType: "HOSPITAL_NUMBER",
  value: "HN-001",
  page: 1,
  pageSize: 25,
  total: 26,
  totalPages: 2,
  hasPreviousPage: false,
  hasNextPage: true,
  classificationFilter: "RISK",
  selfRegistrationFilter: "SELF_REGISTERED",
};

function render(taskMode: "service" | null): string {
  return renderToStaticMarkup(<PatientDirectoryView
    scopes={[directScope, { ...directScope, hospitalId: "44444444-4444-4444-8444-444444444444", hospitalName: "โรงพยาบาล ข" }]}
    selectedScope={directScope}
    lookupType={result.lookupType}
    value={result.value}
    result={result}
    errorMessage={null}
    classificationFilter={result.classificationFilter}
    selfRegistrationFilter={result.selfRegistrationFilter}
    classificationCounts={{ total: 26, risk: 8, diabetes: 3, unclassified: 15 }}
    taskMode={taskMode}
  />);
}

describe("Hospital patient directory task modes", () => {
  it.each([
    ["service", `/app/patients/${patientId}`, "จัดบริการผู้ป่วย"],
  ] as const)("routes %s to its existing next step", (taskMode, href, title) => {
    const html = render(taskMode);

    expect(html).toContain(title);
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain("สมชาย ผู้ป่วย");
  });

  it("preserves task, Hospital, search, filters and pagination in directory navigation", () => {
    const html = render("service");

    expect(html).toContain('name="task" value="service"');
    expect(html).toContain('name="hospitalId" value="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('name="value" value="HN-001"');
    expect(html).toContain('<option value="RISK" selected="">');
    expect(html).toContain('<option value="SELF_REGISTERED" selected="">');
    expect(html).toContain(
      'href="/app/patients?hospitalId=11111111-1111-4111-8111-111111111111&amp;lookupType=HOSPITAL_NUMBER&amp;value=HN-001&amp;page=2&amp;classification=RISK&amp;selfRegistration=SELF_REGISTERED&amp;task=service"',
    );
    expect(html).toContain(
      'href="/app/patients?hospitalId=11111111-1111-4111-8111-111111111111&amp;lookupType=HOSPITAL_NUMBER&amp;task=service"',
    );
  });

  it("resets search and filters when switching Hospital while keeping the service task", () => {
    const html = render("service");
    const switchForm = html.match(/<form[^>]*>[\s\S]*?<\/form>/u)?.[0] ?? "";
    expect(switchForm).toContain('name="hospitalId"');
    expect(switchForm).toContain('name="task" value="service"');
    for (const name of ["lookupType", "value", "classification", "selfRegistration", "page"]) {
      expect(switchForm).not.toContain(`name="${name}"`);
    }
  });

  it("returns to ordinary directory presentation without a valid task", () => {
    const html = render(null);

    expect(html).toContain("รายชื่อผู้ป่วย");
    expect(html).not.toContain("ดูขั้นตอนบริการถัดไป");
    expect(html).not.toContain("บันทึกการคัดกรอง");
  });
});
