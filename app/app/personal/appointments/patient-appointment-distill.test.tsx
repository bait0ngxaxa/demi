// PATIENT-APPT-DISTILL: the Patient appointment screens show summary → actions → request status,
// with no policy paragraphs, staff/audit fields or empty placeholders.
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PatientAppointmentRescheduleRequest } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PatientSelfAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  acknowledgeOwnPatientAppointmentAction: vi.fn(),
  requestOwnPatientAppointmentCancellationAction: vi.fn(),
}));
vi.mock("@/modules/appointments/transport/reschedule-request-actions", () => ({
  submitRescheduleRequestAction: vi.fn(),
  rejectRescheduleRequestAction: vi.fn(),
}));

import { PatientSelfAppointmentDetailView } from "../patient-self-record-detail-views";
import { patientAppointmentRowChip } from "../patient-self-appointment-content";
import { patientAppointmentRequestCards } from "./patient-appointment-requests";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const updatedAt = new Date("2026-11-10T03:00:00.000Z");
const earlier = new Date("2026-11-01T03:00:00.000Z");

const detail: PatientSelfAppointmentDetail = {
  appointmentId,
  serviceCode: null,
  source: "HOSPITAL",
  type: "FOLLOW_UP",
  scheduledAt: new Date("2026-11-20T02:30:00.000Z"),
  durationMinutes: null,
  locationType: null,
  locationDetail: null,
  status: "SCHEDULED",
  updatedAt,
  responsibleDisplayName: null,
  responsibleProfession: null,
  osmAtCreationDisplayName: "อสม. ตอนสร้างนัด",
  assignedOsmDisplayName: null,
  appointer: { displayName: "พยาบาลผู้นัด", role: "NURSE" },
  acknowledgement: null,
  cancellationRequests: [],
  pendingReschedule: false,
  relationship: {
    relationshipId,
    hospitalCode: "H-001",
    hospitalName: "โรงพยาบาล ก",
    hospitalNumber: null,
    hospitalStatus: "ACTIVE",
    careEndedAt: null,
  },
  parentHospitalName: null,
  contactPhones: { assignedOsmPhone: null, hospitalPhone: null, patientPhone: null },
};

function rescheduleRequest(overrides: Partial<PatientAppointmentRescheduleRequest> = {}): PatientAppointmentRescheduleRequest {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    appointmentId,
    sourceAppointmentUpdatedAt: updatedAt,
    submittedByUserId: "44444444-4444-4444-8444-444444444444",
    source: "PATIENT_SELF",
    submissionNonce: "55555555-5555-4555-8555-555555555555",
    status: "PENDING",
    submittedAt: updatedAt,
    resolvedByUserId: null,
    resolvedAt: null,
    preferredDatetimes: [new Date("2026-11-25T03:00:00.000Z")],
    reason: "ติดธุระ",
    rejectionReason: null,
    ...overrides,
  };
}

type Overrides = {
  detail?: Partial<PatientSelfAppointmentDetail>;
  relationship?: Partial<PatientSelfAppointmentDetail["relationship"]>;
  requests?: PatientAppointmentRescheduleRequest[];
  canRequest?: boolean;
};

function render({ detail: detailOverrides = {}, relationship = {}, requests = [], canRequest = true }: Overrides = {}): string {
  const value = { ...detail, ...detailOverrides, relationship: { ...detail.relationship, ...relationship } };
  return renderToStaticMarkup(
    <PatientSelfAppointmentDetailView
      cancellationRequestNonce="66666666-6666-4666-8666-666666666666"
      detail={value}
      rescheduleHistory={{ requests, canRequest, canReview: false, updatedAt: value.updatedAt, scheduled: value.status === "SCHEDULED" }}
      rescheduleNonce="77777777-7777-4777-8777-777777777777"
    />,
  );
}

/** The visible label of every button, in document order. */
function buttonLabels(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(([, inner]) => (inner ?? "").replace(/<[^>]+>/g, "").trim());
}

describe("Patient appointment detail", () => {
  it("shows only fields with a value and no staff/audit data or placeholders", () => {
    const markup = render();
    for (const absent of ["ไม่ระบุ", "ยังไม่ระบุ", "ไม่มีข้อมูล", "ยังไม่ได้ระบุ", "ผู้นัดหมาย", "พยาบาลผู้นัด", "OSM", "อสม. ตอนสร้างนัด", "สถานที่", "ระยะเวลา", "เบอร์ติดต่อโรงพยาบาล", "ผู้รับผิดชอบ"]) {
      expect(markup).not.toContain(absent);
    }
    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).toContain("เวลา 09:30 น.");
    expect(markup).toContain("20 พฤศจิกายน");
  });

  it("orders the mobile actions acknowledge → reschedule → cancel", () => {
    const markup = render();
    expect(markup).toContain("สิ่งที่ทำได้");
    expect(buttonLabels(markup)).toEqual(["รับทราบนัดหมาย", "ขอเลื่อนนัด", "ขอยกเลิกนัด"]);
    expect(markup).not.toContain("คำขอของคุณ");
  });

  it("replaces the acknowledge button with a success line once acknowledged", () => {
    const markup = render({ detail: { acknowledgement: { source: "OSM_PROXY", acknowledgedAt: updatedAt } } });
    expect(buttonLabels(markup)).toEqual(["ขอเลื่อนนัด", "ขอยกเลิกนัด"]);
    expect(markup).toMatch(/role="status"[^>]*>[\s\S]*รับทราบแล้ว · /);
    expect(markup).not.toContain("OSM บันทึกแทนผู้ป่วย");
  });

  it("hides ขอเลื่อนนัด while a reschedule request is pending and shows its status card", () => {
    const markup = render({ requests: [rescheduleRequest()] });
    expect(buttonLabels(markup)).toEqual(["รับทราบนัดหมาย", "ขอยกเลิกนัด"]);
    expect(markup).toContain("คำขอของคุณ");
    expect(markup).toContain("ขอเลื่อนนัด — รอโรงพยาบาลพิจารณา");
    expect(markup).toContain("ดูวันที่เสนอและเหตุผล");
    expect(markup).toContain("ติดธุระ");
  });

  it("hides ขอเลื่อนนัด when the history does not allow a request", () => {
    expect(buttonLabels(render({ canRequest: false }))).toEqual(["รับทราบนัดหมาย", "ขอยกเลิกนัด"]);
  });

  it("hides ขอยกเลิกนัด while a cancellation request is pending", () => {
    const markup = render({ detail: { cancellationRequests: [{ source: "PATIENT_SELF", status: "PENDING", submittedAt: updatedAt, sourceAppointmentUpdatedAt: updatedAt }] } });
    expect(buttonLabels(markup)).toEqual(["รับทราบนัดหมาย", "ขอเลื่อนนัด"]);
    expect(markup).toContain("ขอยกเลิกนัด — รอโรงพยาบาลพิจารณา");
    expect(markup).not.toContain("คำขอยกเลิกล่าสุด");
  });

  it.each([
    ["care ended", { careEndedAt: new Date("2026-11-11T00:00:00.000Z") }, "โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว ดูนัดหมายเดิมได้อย่างเดียว"],
    ["an inactive Hospital", { hospitalStatus: "SUSPENDED" as const }, "นัดหมายนี้ดูได้อย่างเดียว"],
  ])("shows no actions panel and one info line for %s", (_label, relationship, line) => {
    const markup = render({ relationship });
    expect(buttonLabels(markup)).toEqual([]);
    expect(markup).not.toContain("สิ่งที่ทำได้");
    expect(markup.split(line)).toHaveLength(2);
    expect(markup).not.toContain("ยังไม่สามารถ");
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)("shows no actions for a %s appointment", (status) => {
    const markup = render({ detail: { status } });
    expect(buttonLabels(markup)).toEqual([]);
    expect(markup).not.toContain("สิ่งที่ทำได้");
    expect(markup).not.toContain("เป็นประวัติผลนัด");
  });

  it("no longer renders the staff reschedule section on the Patient page", () => {
    const markup = render({ requests: [rescheduleRequest({ status: "SUPERSEDED", sourceAppointmentUpdatedAt: earlier })] });
    for (const staff of ["ส่งคำขอเลื่อนนัดใหม่", "ยังไม่มีคำขอเลื่อนนัด", "ผู้ส่งคำขอ", "นัดหมายเปลี่ยนแปลงแล้ว", "คำขอของคุณ"]) {
      expect(markup).not.toContain(staff);
    }
    const page = readFileSync(path.join(__dirname, "[relationshipId]/[appointmentId]/page.tsx"), "utf8");
    expect(page).not.toContain("RescheduleRequestSection");
  });
});

describe("คำขอของคุณ", () => {
  const cancellation = (status: "PENDING" | "REJECTED" | "APPROVED" | "SUPERSEDED", source = updatedAt) => ({
    source: "PATIENT_SELF" as const, status, submittedAt: source, sourceAppointmentUpdatedAt: source,
  });

  it("shows PENDING requests and the latest REJECTED one with its reason", () => {
    const cards = patientAppointmentRequestCards({
      appointmentUpdatedAt: updatedAt,
      rescheduleRequests: [rescheduleRequest({ status: "REJECTED", rejectionReason: "วันที่เสนอเต็มแล้ว" })],
      cancellationRequests: [cancellation("PENDING")],
    });
    expect(cards.map((card) => card.kind)).toEqual(["CANCELLATION_PENDING", "RESCHEDULE_REJECTED"]);
    expect(cards[1]).toMatchObject({ rejectionReason: "วันที่เสนอเต็มแล้ว" });
  });

  it("hides SUPERSEDED, APPROVED and rejections about an earlier schedule", () => {
    expect(patientAppointmentRequestCards({
      appointmentUpdatedAt: updatedAt,
      rescheduleRequests: [
        rescheduleRequest({ id: "a", status: "APPROVED", sourceAppointmentUpdatedAt: earlier }),
        rescheduleRequest({ id: "b", status: "SUPERSEDED", sourceAppointmentUpdatedAt: earlier }),
        rescheduleRequest({ id: "c", status: "REJECTED", sourceAppointmentUpdatedAt: earlier }),
      ],
      cancellationRequests: [cancellation("SUPERSEDED", earlier), cancellation("REJECTED", earlier)],
    })).toEqual([]);
  });

  it("shows a rejection only while it is the latest request about this schedule", () => {
    expect(patientAppointmentRequestCards({
      appointmentUpdatedAt: updatedAt,
      rescheduleRequests: [],
      cancellationRequests: [cancellation("APPROVED"), cancellation("REJECTED")],
    })).toEqual([]);
    const markup = render({ detail: { cancellationRequests: [cancellation("REJECTED")] } });
    expect(markup).toContain("โรงพยาบาลไม่อนุมัติคำขอยกเลิกนัด");
  });
});

describe("Patient list row chip", () => {
  const base = { status: "SCHEDULED" as const, cancellationRequests: [], pendingReschedule: false, acknowledgement: null };
  const pendingCancellation = [{ source: "PATIENT_SELF" as const, status: "PENDING" as const, submittedAt: updatedAt, sourceAppointmentUpdatedAt: updatedAt }];
  const acknowledged = { source: "PATIENT_SELF" as const, acknowledgedAt: updatedAt };

  it("follows cancellation → reschedule → acknowledgement priority", () => {
    expect(patientAppointmentRowChip({ ...base, cancellationRequests: pendingCancellation, pendingReschedule: true })?.label).toBe("ขอยกเลิก รอพิจารณา");
    expect(patientAppointmentRowChip({ ...base, pendingReschedule: true })?.label).toBe("ขอเลื่อน รอพิจารณา");
    expect(patientAppointmentRowChip(base)).toEqual({ label: "รอคุณรับทราบ", variant: "warning" });
    expect(patientAppointmentRowChip({ ...base, acknowledgement: acknowledged })).toEqual({ label: "รับทราบแล้ว", variant: "neutral" });
  });

  it("uses warning only for the action-needed chip", () => {
    for (const chip of [
      patientAppointmentRowChip({ ...base, cancellationRequests: pendingCancellation }),
      patientAppointmentRowChip({ ...base, pendingReschedule: true }),
      patientAppointmentRowChip({ ...base, acknowledgement: acknowledged }),
    ]) {
      expect(chip?.variant).not.toBe("warning");
    }
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)("shows no chip for a %s row", (status) => {
    expect(patientAppointmentRowChip({ ...base, status })).toBeNull();
  });
});

describe("Patient and family appointment modules", () => {
  it.each([
    "app/app/appointment-summary.tsx",
    "app/app/personal/patient-self-appointment-content.tsx",
    "app/app/personal/patient-self-record-detail-views.tsx",
    "app/app/personal/appointments/patient-appointment-interaction-controls.tsx",
    "app/app/personal/appointments/patient-appointment-requests.tsx",
    "app/app/personal/appointments/personal-appointment-hub.tsx",
    "app/app/personal/appointments/[relationshipId]/[appointmentId]/page.tsx",
    "app/app/family/grants/[grantId]/appointments/appointment-fields.tsx",
    "app/app/family/grants/[grantId]/appointments/[appointmentId]/page.tsx",
  ])("%s does not import the appointment guidance paragraphs", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/APPOINTMENT_(ACKNOWLEDGEMENT|CANCELLATION_REQUEST|RESCHEDULE)_GUIDANCE/);
  });
});
