import { AppointmentLocationType, AppointmentStatus, AppointmentType, Profession } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FamilyHealthSummary } from "@/modules/family/services/family-health-summary-query-service";
import { buildServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";
import { progressRelationship, progressPatient } from "../../../../tests/support/service-progress";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AppointmentFields } from "../grants/[grantId]/appointments/appointment-fields";
import { FamilyHealthSummaryView } from "./family-health-summary-view";

const relationshipId = "44444444-4444-4444-8444-444444444444";
const grantId = "55555555-5555-4555-8555-555555555555";
const base: FamilyHealthSummary = {
  relationshipId, patient: { givenName: "แม่", familyName: "ใจดี" }, relationshipLabel: "บุตร",
  profile: null, nextAppointment: null, healthPlan: null, medications: null,
};
const full: FamilyHealthSummary = {
  ...base,
  profile: { age: 66, careTeams: [{ hospitalName: "รพ.สต. บ้านใหม่", parentHospitalName: "โรงพยาบาลแม่ข่าย", osmDisplayName: "อสม. สมศรี", hospitalPhone: "021234567" }] },
  nextAppointment: { appointment: { grantId, appointmentId: "66666666-6666-4666-8666-666666666666", hospitalName: "รพ.สต. บ้านใหม่",
    type: AppointmentType.FOLLOW_UP, scheduledAt: new Date("2026-11-01T03:00:00.000Z"), status: AppointmentStatus.SCHEDULED } },
  healthPlan: { serviceProgress: [], plans: [{ hospitalName: "รพ.สต. บ้านใหม่", roundNumber: 2, createdAt: new Date("2026-10-01T00:00:00.000Z"), primaryGoalLabel: "ลดน้ำหนัก",
    targets: { weightLossKg: 3, waistCm: null, bloodSugarMgDl: null, hba1cPercent: null },
    activities: [{ activityLabel: "เดินเร็ว", targetDays: 5, targetValue: 30, targetUnit: "นาที" }] }] },
  medications: { items: [{ medicationId: "77777777-7777-4777-8777-777777777777", medicationName: "เมทฟอร์มิน", times: ["08:00", "20:00"] }] },
};

describe("AF-5 family health summary view", () => {
  it("renders every granted block with the Hospital/รพ.สต. phone and never a private one", () => {
    const markup = renderToStaticMarkup(<FamilyHealthSummaryView summary={full} />);
    for (const text of ["แม่ ใจดี", "บุตร", "66 ปี", "นัดถัดไป", "รพ.สต. บ้านใหม่ · โรงพยาบาลแม่ข่าย", "อสม. สมศรี", 'href="tel:021234567"',
      "แผนสุขภาพปัจจุบัน", "ลดน้ำหนัก 3 กก.", "เดินเร็ว 5 วัน/สัปดาห์ · 30 นาที", "ยาที่ใช้อยู่", "เมทฟอร์มิน", "เวลา 08:00, 20:00 น."]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain(`/app/family/grants/${grantId}/appointments/`);
    expect(markup).not.toMatch(/<form|<button/u);
  });

  it("omits a block without its grant instead of showing it empty, and says when nothing is shared", () => {
    const markup = renderToStaticMarkup(<FamilyHealthSummaryView summary={base} />);
    for (const heading of ["นัดถัดไป", "ผู้ดูแลและการติดต่อ", "แผนสุขภาพปัจจุบัน", "บริการปัจจุบัน", "ยาที่ใช้อยู่", "อายุ"]) expect(markup).not.toContain(heading);
    expect(markup).toContain("ผู้ป่วยยังไม่ได้แชร์ข้อมูลสุขภาพกับคุณ");
  });

  it("shows a granted but empty block as empty and hides age without a date of birth", () => {
    const markup = renderToStaticMarkup(<FamilyHealthSummaryView summary={{
      ...base, profile: { age: null, careTeams: [] }, nextAppointment: { appointment: null }, medications: { items: [] },
    }} />);
    expect(markup).toContain("ไม่มีนัดหมายที่จะถึงในช่วง 90 วันข้างหน้า");
    expect(markup).toContain("ยังไม่มีรายการยาที่ใช้อยู่");
    expect(markup).not.toContain("อายุ");
    expect(markup).not.toContain("แผนสุขภาพปัจจุบัน");
  });

  it("shows granted progress with all three lists, no recorder names, forms or record links, and no appointment hint without its grant", () => {
    const record = progressRelationship();
    record.programs[0].serviceOneConfidences = [{ roundNumber: 1, recordedAt: new Date(), recordedByUser: progressPatient, score: 7, improvementPlan: "บันทึกลับ" }];
    const progress = buildServiceProgress(record, undefined, { readOnly: true }).progress;
    const markup = renderToStaticMarkup(<FamilyHealthSummaryView summary={{ ...base, healthPlan: { plans: [], serviceProgress: [progress] } }} />);
    for (const text of ["บริการปัจจุบัน", "ครั้งที่ 1 · ทำแล้ว", "ผู้ป่วยบันทึกเองได้", "เจ้าหน้าที่/อสม. จะทำให้", "ทำแล้ว", "ผู้ป่วยบันทึกเอง", "ครั้งปัจจุบัน"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/<form|<button|<summary|\/record\/|\/app\/personal\/care|ชื่อเจ้าหน้าที่ลับ|ชื่อผู้ป่วย|บันทึกลับ|ยังไม่มีนัด|นัดถัดไป/u);
  });
});

describe("AF-5 family appointment projection by contract version", () => {
  const appointment = {
    serviceCode: null, source: "HOSPITAL" as const,
    appointmentId: "appointment-locator", hospitalName: "รพ.สต. บ้านใหม่", type: AppointmentType.FOLLOW_UP,
    scheduledAt: new Date("2026-11-01T03:00:00.000Z"), durationMinutes: 30, locationType: AppointmentLocationType.HOME_VISIT, status: AppointmentStatus.SCHEDULED,
  };

  it("v2 adds the parent Hospital, location detail, appointer and OSM at creation", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={{ ...appointment, extension: {
      locationDetail: "บ้านเลขที่ 1", responsibleDisplayName: "หมอ ใจดี", responsibleProfession: Profession.DOCTOR,
      osmAtCreationDisplayName: "อสม. สมศรี", parentHospitalName: "โรงพยาบาลแม่ข่าย",
    } }} />);
    for (const text of ["รพ.สต. บ้านใหม่ · โรงพยาบาลแม่ข่าย", "บ้านเลขที่ 1", "แพทย์ผู้ดูแล", "หมอ ใจดี", "อสม. สมศรี"]) expect(markup).toContain(text);
    expect((markup.match(/<dt /g) ?? []).length).toBe(9);
  });

  it("v1 keeps exactly the six original fields", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={{ ...appointment, extension: null }} />);
    expect((markup.match(/<dt /g) ?? []).length).toBe(6);
    expect(markup).not.toMatch(/รายละเอียดสถานที่|ผู้ดูแล|อสม\./u);
  });
});
