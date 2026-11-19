import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppointmentActionState, AppointmentInteractionActionState } from "@/modules/appointments/transport/action-state";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as Array<AppointmentActionState | AppointmentInteractionActionState>,
  pending: [] as boolean[],
  effects: [] as Array<() => void>,
  refresh: vi.fn(),
  action: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => {
    const index = hooks.cursor++;
    return [hooks.states[index] ?? initial, hooks.action, hooks.pending[index] ?? false];
  },
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: hooks.refresh }) }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  acknowledgeAppointmentOnBehalfOfPatientAction: vi.fn(),
  requestAppointmentCancellationOnBehalfOfPatientAction: vi.fn(),
  recordAppointmentCoordinationAction: vi.fn(),
  approveAppointmentCancellationRequestAction: vi.fn(),
  rejectAppointmentCancellationRequestAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  completeAppointmentAction: vi.fn(),
  markAppointmentNoShowAction: vi.fn(),
}));

import { AppointmentInteractionControls } from "./[appointmentId]/appointment-interaction-controls";
import { AppointmentMutationControls } from "./[appointmentId]/appointment-mutation-controls";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const updatedAt = new Date("2026-10-13T03:00:00.000Z");
const work: ComponentProps<typeof AppointmentInteractionControls> = {
  relationshipId, appointmentId, expectedUpdatedAt: updatedAt.toISOString(), status: "SCHEDULED",
  canManage: false, canProxyPatientActions: false, canRecordCoordination: false,
  acknowledgement: null, cancellationRequests: [], coordinationEvents: [],
  cancellationRequestNonce: "nonce", coordinationSubmissionNonce: "coordination-nonce",
};
const request: ComponentProps<typeof AppointmentInteractionControls>["cancellationRequests"][number] = {
  requestId: "33333333-3333-4333-8333-333333333333", source: "PATIENT_SELF", status: "PENDING",
  submittedAt: updatedAt, resolvedAt: null, submittedByDisplayName: "ผู้ป่วยทดสอบ", resolvedByDisplayName: null,
};
function workInteractions(overrides: Partial<typeof work> = {}): string {
  return renderToStaticMarkup(<AppointmentInteractionControls {...work} {...overrides} />);
}
function mutations(canManage = true, status = "SCHEDULED"): string {
  return renderToStaticMarkup(<AppointmentMutationControls relationshipId={relationshipId} appointmentId={appointmentId} expectedUpdatedAt={updatedAt.toISOString()} canManage={canManage} status={status} />);
}
function resetRender(): void { hooks.cursor = 0; hooks.effects = []; }
function buttons(markup: string): string[] { return [...markup.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag); }

beforeEach(() => {
  resetRender(); hooks.states = []; hooks.pending = []; hooks.refresh.mockClear();
});

describe("Appointment capability-scoped interaction presentation", () => {
  it("keeps proxy/coordination separate and denies direct management to OSM", () => {
    const markup = workInteractions({ canProxyPatientActions: true, canRecordCoordination: true });
    expect(buttons(markup)).toHaveLength(3);
    expect(markup).toContain("ส่งคำขอยกเลิกแทนผู้ป่วย");
    expect(markup).toContain("บันทึกว่าประสานงานแล้ว");
    expect(markup).toContain("ไม่เปลี่ยนสถานะนัด");
    expect(markup).toContain("ไม่ใช่การตอบรับงานมอบหมาย OSM");
    resetRender();
    expect(mutations(false)).toBe("");
    expect(markup).not.toContain("อนุมัติและยกเลิกนัด");
  });

  it("allows Hospital request review without inheriting proxy actions", () => {
    const markup = workInteractions({ canManage: true, cancellationRequests: [request] });
    expect(buttons(markup)).toHaveLength(2);
    expect(markup).toContain("อนุมัติและยกเลิกนัด");
    expect(markup).toContain("ปฏิเสธคำขอ");
    expect(markup).toContain(`value="${request.requestId}"`);
    expect(markup).not.toContain("ส่งคำขอยกเลิกแทนผู้ป่วย");
    resetRender();
    expect(buttons(mutations())).toHaveLength(3);
  });

  it("preserves authorized OSM coordination on terminal appointments without response or status mutations", () => {
    const markup = workInteractions({ status: "COMPLETED", canProxyPatientActions: true, canRecordCoordination: true });
    expect(buttons(markup)).toHaveLength(1);
    expect(markup).toContain("บันทึกว่าประสานงานแล้ว");
    expect(markup).not.toContain("ส่งคำขอยกเลิกแทนผู้ป่วย");
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)("keeps %s Hospital outcomes read-only", (status) => {
    const markup = mutations(true, status);
    expect(buttons(markup)).toHaveLength(0);
    expect(markup).toContain("ประวัติผลนัด");
  });

  it("disables all proxy, coordination and review submits while a Work action is pending", () => {
    hooks.pending[2] = true;
    const markup = workInteractions({ canProxyPatientActions: true, canRecordCoordination: true, canManage: true, cancellationRequests: [request] });
    expect(buttons(markup).length).toBeGreaterThan(0);
    expect(buttons(markup).every((tag) => tag.includes('disabled=""'))).toBe(true);
  });

  it.each(["CANCELLATION_APPROVED", "CANCELLATION_REJECTED", "CANCELLATION_SUPERSEDED"] as const)("keeps %s review feedback after persisted request readback", (operation) => {
    hooks.states[3] = { status: "SUCCESS", operation, appointmentId, patientHospitalRelationshipId: relationshipId };
    const markup = workInteractions({ canManage: true, cancellationRequests: [{ ...request, status: operation === "CANCELLATION_APPROVED" ? "APPROVED" : operation === "CANCELLATION_REJECTED" ? "REJECTED" : "SUPERSEDED" }] });
    expect(markup).toContain(operation === "CANCELLATION_SUPERSEDED" ? "bg-warning-soft" : "bg-success-soft");
    expect(buttons(markup)).toHaveLength(0);
    hooks.effects.forEach((effect) => effect());
    expect(hooks.refresh).toHaveBeenCalledOnce();
  });

  it("retains operational success feedback when refreshed appointment becomes terminal", () => {
    hooks.states[1] = { status: "SUCCESS", result: { appointmentId, patientHospitalRelationshipId: relationshipId, status: "COMPLETED", updatedAt: updatedAt.toISOString() } };
    const markup = mutations(true, "COMPLETED");
    expect(markup).toContain("บันทึกสถานะนัดหมายแล้ว: เสร็จสิ้น");
    expect(buttons(markup)).toHaveLength(0);
    hooks.effects.forEach((effect) => effect());
    expect(hooks.refresh).toHaveBeenCalledOnce();
  });
});
