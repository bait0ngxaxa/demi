import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppointmentDetail } from "@/modules/appointments/services/appointment-query-service";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(), program: vi.fn(), followups: vi.fn(), actor: vi.fn(),
  connection: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/appointments/services/appointment-query-service", () => ({ getAppointmentDetail: mocks.detail }));
vi.mock("@/modules/patient-program/services/patient-program-query-service", () => ({ getPatientProgramPageContext: mocks.program }));
vi.mock("@/modules/followups/services/followup-query-service", () => ({ getFollowupHistoryForProgram: mocks.followups }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  acknowledgeAppointmentOnBehalfOfPatientAction: vi.fn(),
  requestAppointmentCancellationOnBehalfOfPatientAction: vi.fn(),
  recordAppointmentCoordinationAction: vi.fn(),
  approveAppointmentCancellationRequestAction: vi.fn(),
  rejectAppointmentCancellationRequestAction: vi.fn(),
  cancelAppointmentAction: vi.fn(), completeAppointmentAction: vi.fn(), markAppointmentNoShowAction: vi.fn(),
}));

import AppointmentDetailPage from "./[appointmentId]/page";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const detail: AppointmentDetail = {
  patient: { patientHospitalRelationshipId: relationshipId, displayName: "สมใจ ผู้ป่วยทดสอบ", hospitalNumber: "HN-001", hospital: { id: "hospital-a", name: "โรงพยาบาล ก" } },
  appointmentId, canManage: true, canProxyPatientActions: false, canRecordCoordination: false,
  responsibleUserId: null, responsibleDisplayName: null, responsibleProfession: null,
  osmAtCreationDisplayName: "อสม. เมื่อสร้างนัด", currentAcknowledgement: null, cancellationRequests: [], coordinationEvents: [],
  createdByDisplayName: "เจ้าหน้าที่ผู้สร้าง", type: "CONSULTATION", status: "SCHEDULED",
  scheduledAt: new Date("2026-10-14T03:00:00.000Z"), durationMinutes: 30,
  locationType: "CLINIC", locationDetail: "ห้องตรวจ ก", note: null,
  createdAt: new Date("2026-10-13T03:00:00.000Z"), updatedAt: new Date("2026-10-13T03:00:00.000Z"),
};
async function render(): Promise<string> {
  return renderToStaticMarkup(await AppointmentDetailPage({ params: Promise.resolve({ relationshipId, appointmentId }) }));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue({ userId: "actor" });
  mocks.detail.mockResolvedValue(detail); mocks.program.mockResolvedValue({ active: null });
});

describe("Work appointment journey", () => {
  it("shows exact Patient/Hospital context and distinct operational versus interaction sections", async () => {
    const markup = await render();
    expect(mocks.detail).toHaveBeenCalledWith({ userId: "actor" }, relationshipId, appointmentId);
    expect(markup).toContain(detail.patient.displayName);
    expect(markup).toContain(detail.patient.hospital.name);
    expect(markup).toContain("HN-001");
    expect(markup).toContain("ห้องตรวจ ก");
    expect(markup).toContain(`href="/app/patients/${relationshipId}/appointments/${appointmentId}/edit"`);
    expect(markup).toContain(`href="/app/patients/${relationshipId}#patient-care"`);
    expect(markup).toContain("จัดการสถานะนัดหมายโดยโรงพยาบาล");
    expect(markup).toContain("ไม่สร้างบันทึกการติดตามผลหรือจบโปรแกรมอัตโนมัติ");
    expect([...markup.matchAll(/id="appointment-acknowledgement-heading"/g)]).toHaveLength(1);
    expect(markup).not.toContain("ส่งคำขอยกเลิกแทนผู้ป่วย");
  });

  it("keeps current-assignment capabilities separate from OSM-at-creation display", async () => {
    mocks.detail.mockResolvedValue({ ...detail, canManage: false, canProxyPatientActions: true, canRecordCoordination: true, osmAtCreationDisplayName: null });
    const markup = await render();
    expect(markup).toContain("ไม่มีข้อมูล OSM ณ วันที่สร้างนัด");
    expect(markup).toContain("ไม่ยืนยันผู้รับผิดชอบปัจจุบันหรือการตอบรับงาน");
    expect(markup).toContain("ส่งคำขอยกเลิกแทนผู้ป่วย");
    expect(markup).toContain("บันทึกว่าประสานงานแล้ว");
    expect(markup).not.toMatch(/\/edit"|ทำเครื่องหมายว่าเสร็จสิ้น|ทำเครื่องหมายว่าไม่มาตามนัด/);
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)("keeps %s historical and returns to the exact care journey", async (status) => {
    mocks.detail.mockResolvedValue({ ...detail, status });
    const markup = await render();
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain('/edit"');
    expect(markup).toContain(`href="/app/patients/${relationshipId}/appointments"`);
    expect(markup).toContain(`href="/app/patients/${relationshipId}#patient-care"`);
    if (status === "COMPLETED") expect(markup).toContain("สถานะนัดหมายไม่ได้ยืนยันว่ามีบันทึกการติดตามผลหรือการจบโปรแกรม");
    expect(markup).not.toMatch(/ส่ง LINE|สร้างโปรแกรมแล้ว|บันทึกการติดตามผลแล้ว/);
  });

  it("preserves the existing independently authorized active Program follow-up destination", async () => {
    mocks.detail.mockResolvedValue({ ...detail, status: "COMPLETED" });
    mocks.program.mockResolvedValue({ active: { programId: "program-a" } });
    mocks.followups.mockResolvedValue({ canRecord: true });
    const markup = await render();
    expect(mocks.followups).toHaveBeenCalledWith({ userId: "actor" }, "program-a");
    expect(markup).toContain(`href="/app/patients/${relationshipId}/programs/program-a/followups/new?appointmentId=${appointmentId}"`);
    expect(markup).toContain("สถานะนัดหมายไม่ได้ยืนยันว่ามีบันทึกการติดตามผล");
  });

  it.each([new ForbiddenError(), new NotFoundError()])("preserves safe denied/not-found routing without rendering foreign data", async (error) => {
    mocks.detail.mockRejectedValue(error);
    await expect(render()).rejects.toThrow(error instanceof ForbiddenError ? "REDIRECT:/app" : "NOT_FOUND");
  });
});
