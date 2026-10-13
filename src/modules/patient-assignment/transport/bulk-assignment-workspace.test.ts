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
vi.mock("./server-actions", () => ({ bulkAssignOsmToPatientsAction: vi.fn() }));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const scope = { hospitalId, hospitalName: "โรงพยาบาลสังเคราะห์" };
const patients = [1, 2, 3].map((index) => ({
  patientProfileId: `00000000-0000-4000-8000-00000000000${index}`,
  patientHospitalRelationshipId: `10000000-0000-4000-8000-00000000000${index}`,
  displayName: `ผู้ป่วย ${index}`,
  hospital: { id: hospitalId, name: scope.hospitalName },
  hospitalNumber: index === 3 ? null : `HN-${index}`,
  classification: null,
}));
const view = {
  hospital: scope,
  patients,
  totalWithoutOsm: 3,
  osmCandidates: [{ userId: "20000000-0000-4000-8000-000000000001", displayName: "อสม. หนึ่ง" }],
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
    expect(markup).toContain("เลือกทั้งหมดที่แสดง (3)");
    expect(markup.match(/type="checkbox"/gu)).toHaveLength(4);
    expect(markup.match(/<select/gu)).toHaveLength(1);
    expect(markup).toContain("อสม. หนึ่ง");
    expect(markup).toContain("HN ไม่ระบุ");
  });

  it("requires a selection and an OSM before the confirmation step, and has no submit yet", () => {
    const markup = render({ status: "IDLE" });

    expect(markup).toMatch(/<button[^>]*disabled[^>]*>ตรวจสอบก่อนมอบหมาย<\/button>/u);
    expect(markup).not.toContain("ยืนยันมอบหมาย");
    expect(markup).not.toContain('name="submissionNonce"');
  });

  it("explains the 500-patient cap when more patients exist than are shown", () => {
    const markup = render({ status: "IDLE" }, { view: { ...view, totalWithoutOsm: 731 } });

    expect(markup).toContain("พบ 731 คน");
    expect(markup).toContain("เลือกได้ไม่เกิน 500 คนต่อครั้ง");
  });

  it("shows an empty state when every patient already has an OSM", () => {
    const markup = render({ status: "IDLE" }, { view: { ...view, patients: [], totalWithoutOsm: 0 } });

    expect(markup).toContain("ผู้ป่วยทุกคนในโรงพยาบาลนี้มี อสม. ผู้รับผิดชอบแล้ว");
  });

  it("shows a message and no OSM picker when the hospital has no eligible OSM", () => {
    const markup = render({ status: "IDLE" }, { view: { ...view, osmCandidates: [] } });

    expect(markup).toContain("ไม่พบ อสม. ที่เปิดใช้งานในโรงพยาบาลนี้");
    expect(markup).not.toContain("<select");
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
