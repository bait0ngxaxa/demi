import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), confirm: vi.fn(), reject: vi.fn(), create: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/patient-service-request-service", () => ({
  DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE: "มีคำขอบริการนี้ที่ยังรอโรงพยาบาลดำเนินการอยู่แล้ว",
  confirmPatientServiceRequest: mocks.confirm,
  rejectPatientServiceRequest: mocks.reject,
  createPatientServiceRequest: mocks.create,
}));
import {
  confirmPatientServiceRequestAction,
  createPatientServiceRequestAction,
  rejectPatientServiceRequestAction,
} from "./server-actions";

const requestId = "11111111-1111-4111-8111-111111111111";
const osmUserId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";
const relationshipId = "44444444-4444-4444-8444-444444444444";

function confirmForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    requestId, osmUserId, submissionNonce: nonce, scheduledAt: "2026-11-02T09:00:00+07:00",
    durationMinutes: "30", locationDetail: "", note: "", ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function rejectForm(reason: string): FormData {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("reason", reason);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "trusted-reviewer" });
  mocks.confirm.mockResolvedValue({ requestId, appointmentId: "55555555-5555-4555-8555-555555555555", patientHospitalRelationshipId: relationshipId });
});

describe("Hospital confirm action (ADR-0023 SR-D1)", () => {
  it("passes the booking fields with the server-issued nonce and invalidates request and appointment readback", async () => {
    const result = await confirmPatientServiceRequestAction({ status: "IDLE" }, confirmForm());
    expect(result).toMatchObject({ status: "SUCCESS", message: expect.stringContaining("ยืนยันนัดแล้ว") });
    expect(mocks.confirm).toHaveBeenCalledWith({ userId: "trusted-reviewer" }, {
      requestId, osmUserId, submissionNonce: nonce, scheduledAt: "2026-11-02T09:00:00+07:00",
      durationMinutes: 30, locationDetail: null, note: null,
    });
    expect(mocks.revalidate.mock.calls).toEqual([
      ["/app/patients/service-requests"], ["/app/personal/services"], ["/app/appointments"],
      [`/app/patients/${relationshipId}/appointments`],
    ]);
  });

  it.each<Record<string, string>>([{ osmUserId: "" }, { scheduledAt: "" }, { submissionNonce: "" }, { durationMinutes: "abc" }])(
    "rejects incomplete input %j before calling the service",
    async (overrides) => {
      expect(await confirmPatientServiceRequestAction({ status: "IDLE" }, confirmForm(overrides))).toMatchObject({ status: "ERROR" });
      expect(mocks.confirm).not.toHaveBeenCalled();
    },
  );

  it("refreshes persisted status on a concurrent/repeated mutation conflict", async () => {
    mocks.confirm.mockRejectedValue(new ConflictError("internal conflict details"));
    const state = await confirmPatientServiceRequestAction({ status: "IDLE" }, confirmForm());
    expect(state).toMatchObject({ status: "ERROR", conflict: true, message: "คำขอซ้ำหรือสถานะเปลี่ยนไปแล้ว กรุณาตรวจสอบรายการอีกครั้ง" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/patients/service-requests");
    expect(JSON.stringify(state)).not.toContain("internal");
  });

  it.each([new ForbiddenError(), new InfrastructureError("secret backend details")])("keeps non-conflict errors sanitized", async (error) => {
    mocks.confirm.mockRejectedValue(error);
    const state = await confirmPatientServiceRequestAction({ status: "IDLE" }, confirmForm());
    expect(state.status).toBe("ERROR");
    expect(state).not.toHaveProperty("conflict");
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("Hospital reject action (ADR-0023 SR-D1)", () => {
  it("requires a reason and passes it trimmed", async () => {
    expect(await rejectPatientServiceRequestAction({ status: "IDLE" }, rejectForm("   "))).toMatchObject({ status: "ERROR" });
    expect(mocks.reject).not.toHaveBeenCalled();
    const result = await rejectPatientServiceRequestAction({ status: "IDLE" }, rejectForm("  ไม่มี อสม. ว่าง  "));
    expect(result).toMatchObject({ status: "SUCCESS", message: expect.stringContaining("ผู้ป่วยจะเห็นเหตุผลนี้") });
    expect(mocks.reject).toHaveBeenCalledWith({ userId: "trusted-reviewer" }, { requestId, reason: "ไม่มี อสม. ว่าง" });
  });
});

describe("Patient request action (ADR-0023 SR-D6)", () => {
  function createForm(overrides: Record<string, string> = {}): FormData {
    const data = new FormData();
    const fields = {
      relationshipId, offeringId: requestId, preferredOsmRelationshipId: "",
      preferredDate: "2026-11-02", preferredSlot: "MORNING", note: "", ...overrides,
    };
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("requires the preferred date and slot", async () => {
    for (const overrides of [{ preferredDate: "" }, { preferredSlot: "" }] as Record<string, string>[]) {
      expect(await createPatientServiceRequestAction({ status: "IDLE" }, createForm(overrides))).toMatchObject({ status: "ERROR" });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows the duplicate-request and date-window messages", async () => {
    mocks.create.mockRejectedValueOnce(new ConflictError("มีคำขอบริการนี้ที่ยังรอโรงพยาบาลดำเนินการอยู่แล้ว"));
    expect(await createPatientServiceRequestAction({ status: "IDLE" }, createForm()))
      .toEqual({ status: "ERROR", message: "มีคำขอบริการนี้ที่ยังรอโรงพยาบาลดำเนินการอยู่แล้ว" });
    mocks.create.mockRejectedValueOnce(new ValidationError("The preferred date must be from tomorrow to 60 days ahead"));
    expect(await createPatientServiceRequestAction({ status: "IDLE" }, createForm()))
      .toEqual({ status: "ERROR", message: "วันที่สะดวกต้องอยู่ระหว่างพรุ่งนี้ถึง 60 วันข้างหน้า" });
  });
});
