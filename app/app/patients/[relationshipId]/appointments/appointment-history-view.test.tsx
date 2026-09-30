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
      type: "CONSULTATION",
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
      type: "CONSULTATION",
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
      type: "CONSULTATION",
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
      type: "CONSULTATION",
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
});
