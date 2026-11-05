import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientOsmBulkAssignmentWorkspace } from "../../../../app/app/patients/assign-osm/patient-osm-bulk-assignment-workspace";
import type { PatientOsmBulkAssignmentActionState } from "./action-state";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return { ...actual, useActionState: mockedUseActionState };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./server-actions", () => ({
  bulkAssignOsmToPatientsAction: vi.fn(),
  searchPatientOsmBulkCandidatesAction: vi.fn(),
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const scope = { hospitalId, hospitalName: "โรงพยาบาลสังเคราะห์" };
const patients = [1, 2, 3].map((index) => ({
  patientProfileId: `00000000-0000-4000-8000-00000000000${index}`,
  patientHospitalRelationshipId: `10000000-0000-4000-8000-00000000000${index}`,
  displayName: `ผู้ป่วย ${index}`,
  hospital: { id: hospitalId, name: scope.hospitalName },
  hospitalNumber: index === 3 ? null : `HN-${index}`,
  classification: null,
  selfRegisteredAt: null,
}));
const view = {
  hospital: scope,
  patients,
  totalWithoutOsm: 3,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

function render(
  state: PatientOsmBulkAssignmentActionState,
  props: Partial<Parameters<typeof PatientOsmBulkAssignmentWorkspace>[0]> = {},
): string {
  mockedUseActionState.mockReturnValue([state, vi.fn(), false]);

  return renderToStaticMarkup(
    createElement(PatientOsmBulkAssignmentWorkspace, {
      scopes: [scope],
      selectedScope: scope,
      view,
      search: "",
      errorMessage: null,
      ...props,
    }),
  );
}

describe("Bulk OSM assignment workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists patients without an OSM with a multi-select and one OSM picker", () => {
    const markup = render({ status: "IDLE" });

    for (const name of ["ผู้ป่วย 1", "ผู้ป่วย 2", "ผู้ป่วย 3"]) {
      expect(markup).toContain(name);
    }

    expect(markup).toContain("พบ 3 คน");
    expect(markup).toContain("เลือกทั้งหมดในหน้านี้ (3)");
    expect(markup).toContain("เลือกแล้ว 0 คน");
    expect(markup).not.toContain("แสดง 3 คนแรก");
    expect(markup).not.toContain("หน้า 1 จาก 1");
    expect(markup.match(/type="checkbox"/gu)).toHaveLength(4);
    expect(markup).toContain("ค้นหาชื่อ อสม.");
    expect(markup).not.toContain("<select");
    expect(markup).toContain("HN ไม่ระบุ");
  });

  it("requires a selection and an OSM before the confirmation step, and has no submit yet", () => {
    const markup = render({ status: "IDLE" });

    expect(markup).toMatch(/<button[^>]*disabled[^>]*>ตรวจสอบก่อนมอบหมาย<\/button>/u);
    expect(markup).not.toContain("ยืนยันมอบหมาย");
    expect(markup).not.toContain('name="submissionNonce"');
  });

  it("explains the 500-patient cap when more patients exist than one batch allows", () => {
    const markup = render({ status: "IDLE" }, { view: { ...view, totalWithoutOsm: 731, totalPages: 30, hasNextPage: true } });

    expect(markup).toContain("พบ 731 คน");
    expect(markup).not.toContain("คนแรก");
    expect(markup).toContain("เลือกได้ไม่เกิน 500 คนต่อครั้ง");
  });

  it("pages the patient list with links that keep the hospital and the search", () => {
    const markup = render(
      { status: "IDLE" },
      { search: "สม ใจ", view: { ...view, totalWithoutOsm: 80, page: 2, totalPages: 4, hasPreviousPage: true, hasNextPage: true } },
    );
    const links = [...markup.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(ก่อนหน้า|ถัดไป)<\/a>/gu)].map((match) => [
      match[2],
      new URL(match[1]?.replaceAll("&amp;", "&") ?? "", "https://demi.invalid"),
    ] as const);

    expect(markup).toContain('aria-label="หน้ารายชื่อผู้ป่วยที่ยังไม่มี อสม."');
    expect(markup).toContain("หน้า 2 จาก 4");
    expect(links.map(([label, url]) => [label, url.pathname, url.searchParams.get("hospitalId"), url.searchParams.get("value"), url.searchParams.get("page")]))
      .toEqual([
        ["ก่อนหน้า", "/app/patients/assign-osm", hospitalId, "สม ใจ", null],
        ["ถัดไป", "/app/patients/assign-osm", hospitalId, "สม ใจ", "3"],
      ]);
  });

  it("shows no previous link on the first page and no next link on the last", () => {
    const first = render({ status: "IDLE" }, { view: { ...view, totalPages: 2, hasNextPage: true } });
    const last = render({ status: "IDLE" }, { view: { ...view, page: 2, totalPages: 2, hasPreviousPage: true } });

    expect(first).toMatch(/<span[^>]*>ก่อนหน้า<\/span>/u);
    expect(first).toMatch(/<a[^>]*>ถัดไป<\/a>/u);
    expect(last).toMatch(/<a[^>]*>ก่อนหน้า<\/a>/u);
    expect(last).toMatch(/<span[^>]*>ถัดไป<\/span>/u);
  });

  it("shows an empty state when every patient already has an OSM", () => {
    const markup = render({ status: "IDLE" }, { view: { ...view, patients: [], totalWithoutOsm: 0 } });

    expect(markup).toContain("ผู้ป่วยทุกคนในโรงพยาบาลนี้มี อสม. ผู้รับผิดชอบแล้ว");
  });

  it("renders a searchable OSM picker in its loading state without fetching every OSM", () => {
    const markup = render({ status: "IDLE" });

    expect(markup).toContain("ยังไม่ได้เลือก อสม.");
    expect(markup).toContain("กำลังค้นหา อสม....");
    expect(markup).toContain('type="search"');
    expect(markup).not.toContain('type="radio"');
  });

  it("confirms success and replay without offering the form again", () => {
    const assigned = render({
      status: "SUCCESS",
      result: { operation: "ASSIGNED", hospitalId, osmUserId: "u", assignedCount: 3 },
    });
    const replayed = render({
      status: "SUCCESS",
      result: { operation: "REPLAYED", hospitalId, osmUserId: "u", assignedCount: 3 },
    });

    expect(assigned).toContain("กำหนด อสม. เรียบร้อยแล้ว");
    expect(assigned).toContain("กำหนด อสม. ให้ผู้ป่วย 3 คน");
    expect(replayed).toContain("คำขอนี้ถูกบันทึกไปแล้ว ระบบไม่มอบหมายซ้ำ");
    expect(assigned).not.toContain('type="checkbox"');
  });

  it("shows the search error instead of the lists", () => {
    const markup = render({ status: "IDLE" }, { view: null, errorMessage: "กรุณาค้นหาชื่อผู้ป่วยด้วยคำค้นหาที่สั้นลง" });

    expect(markup).toContain("กรุณาค้นหาชื่อผู้ป่วยด้วยคำค้นหาที่สั้นลง");
    expect(markup).not.toContain('type="checkbox"');
  });

  it("offers a hospital switcher only when the actor owns several hospitals", () => {
    const single = render({ status: "IDLE" });
    const several = render(
      { status: "IDLE" },
      { scopes: [scope, { hospitalId: "22222222-2222-4222-8222-222222222222", hospitalName: "โรงพยาบาลอีกแห่ง" }] },
    );

    expect(single).not.toContain("เลือกโรงพยาบาล");
    expect(several).toContain("โรงพยาบาลอีกแห่ง");
  });
});
