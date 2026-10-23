import { Profession } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AppointmentHistory } from "@/modules/appointments/services/appointment-query-service";

import { AppointmentHistoryView } from "./appointment-history-view";

const history: AppointmentHistory = {
  patient: {
    patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111",
    displayName: "Patient Example",
    hospitalNumber: null,
    hospital: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "โรงพยาบาลตัวอย่าง",
    },
  },
  items: [
    {
      appointmentId: "33333333-3333-4333-8333-333333333333",
      scheduledAt: new Date("2026-09-30T03:00:00.000Z"),
      type: "EDUCATION",
      status: "SCHEDULED",
      durationMinutes: 30,
      locationType: "CLINIC",
      responsibleDisplayName: "Doctor Example",
      responsibleProfession: Profession.DOCTOR,
      osmAtCreationDisplayName: null,
      currentAcknowledgement: null,
      cancellationRequests: [],
      coordinationEvents: [],
    },
    {
      appointmentId: "44444444-4444-4444-8444-444444444444",
      scheduledAt: new Date("2026-09-30T03:00:00.000Z"),
      type: "EDUCATION",
      status: "SCHEDULED",
      durationMinutes: 30,
      locationType: "CLINIC",
      responsibleDisplayName: "Nurse Example",
      responsibleProfession: Profession.NURSE,
      osmAtCreationDisplayName: null,
      currentAcknowledgement: null,
      cancellationRequests: [],
      coordinationEvents: [],
    },
    {
      appointmentId: "55555555-5555-4555-8555-555555555555",
      scheduledAt: new Date("2026-09-30T03:00:00.000Z"),
      type: "EDUCATION",
      status: "SCHEDULED",
      durationMinutes: 30,
      locationType: "CLINIC",
      responsibleDisplayName: "Coordinator Example",
      responsibleProfession: Profession.COORDINATOR,
      osmAtCreationDisplayName: null,
      currentAcknowledgement: null,
      cancellationRequests: [],
      coordinationEvents: [],
    },
    {
      appointmentId: "66666666-6666-4666-8666-666666666666",
      scheduledAt: new Date("2026-09-30T03:00:00.000Z"),
      type: "EDUCATION",
      status: "SCHEDULED",
      durationMinutes: null,
      locationType: null,
      responsibleDisplayName: null,
      responsibleProfession: null,
      osmAtCreationDisplayName: null,
      currentAcknowledgement: null,
      cancellationRequests: [],
      coordinationEvents: [],
    },
  ],
  canManage: false,
  canCreate: false,
};

describe("Work appointment responsibility labels", () => {
  it("labels doctors and nurses accurately and keeps historical or absent responsibility neutral", () => {
    const markup = renderToStaticMarkup(<AppointmentHistoryView history={history} />);

    expect(markup).toContain("แพทย์ผู้ดูแล: Doctor Example");
    expect(markup).toContain("พยาบาลผู้ดูแล: Nurse Example");
    expect(markup).toContain("ผู้รับผิดชอบเดิม: Coordinator Example");
    expect(markup).toContain("ผู้รับผิดชอบ: ยังไม่ระบุ");
    expect(markup).not.toContain("แพทย์ผู้ดูแล: Coordinator Example");
    expect(markup).not.toContain("พยาบาลผู้ดูแล: Coordinator Example");
  });

  it("prioritizes persisted scheduled rows over terminal history without claiming complete totals", () => {
    const first = history.items[0];
    if (!first) throw new Error("Missing fixture");
    const markup = renderToStaticMarkup(<AppointmentHistoryView history={{ ...history, items: [
      { ...first, appointmentId: "completed", status: "COMPLETED" },
      { ...first, appointmentId: "cancelled", status: "CANCELLED" },
      { ...first, appointmentId: "no-show", status: "NO_SHOW" },
      { ...first, appointmentId: "scheduled", status: "SCHEDULED" },
    ] }} />);
    const scheduledPosition = markup.indexOf('/appointments/scheduled"');
    const completedPosition = markup.indexOf('/appointments/completed"');
    expect(scheduledPosition).toBeGreaterThan(-1);
    expect(completedPosition).toBeGreaterThan(scheduledPosition);
    expect(markup).toContain("ยกเลิกแล้ว");
    expect(markup).toContain("ไม่มาตามนัด");
    expect(markup).toContain("ไม่ใช่ประวัติทั้งหมด");
    expect(markup).not.toContain("แสดง 4 รายการ");
    expect(markup).not.toMatch(/เกินกำหนด|ยืนยันว่าจะมาแล้ว|ส่ง LINE แล้ว/);
  });

  it.each([true, false])("keeps one creation entry only when canCreate=%s, including the empty workspace", (canCreate) => {
    const markup = renderToStaticMarkup(<AppointmentHistoryView history={{ ...history, canCreate, items: [] }} />);
    expect([...markup.matchAll(/href="[^"]*\/appointments\/new"/g)]).toHaveLength(canCreate ? 1 : 0);
    expect(markup).toContain("ยังไม่มีนัดหมายสำหรับผู้ป่วยรายนี้");
    if (!canCreate) expect(markup).not.toContain("สร้างรายการแรก");
  });

  it("shows empty status groups honestly and preserves exact Patient/Hospital navigation", () => {
    const scheduledMarkup = renderToStaticMarkup(<AppointmentHistoryView history={history} />);
    expect(scheduledMarkup).toContain("ไม่มีประวัติผลนัดในรายการล่าสุดที่แสดง");
    expect(scheduledMarkup).toContain(`href="/app/patients/${history.patient.patientHospitalRelationshipId}"`);
    const markup = renderToStaticMarkup(<AppointmentHistoryView history={{ ...history,
      patient: { ...history.patient, patientHospitalRelationshipId: "other-relationship", hospital: { id: "other-hospital", name: "โรงพยาบาล ข" } },
      items: history.items.map((item) => ({ ...item, status: "COMPLETED" })),
    }} />);
    expect(markup).toContain("โรงพยาบาล ข");
    expect(markup).toContain("ไม่มีสถานะนัดหมายแล้วใน 50 รายการล่าสุดที่แสดง");
    expect(markup).toContain('<details open=""');
    expect(markup).toContain(`href="/app/patients/other-relationship/appointments/${history.items[0]?.appointmentId}"`);
    expect(markup).not.toContain(`/app/patients/${history.patient.patientHospitalRelationshipId}`);
  });
});
