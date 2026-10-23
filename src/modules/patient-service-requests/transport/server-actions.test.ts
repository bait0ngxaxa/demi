import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), review: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/patient-service-request-service", () => ({ reviewPatientServiceRequest: mocks.review }));
import { reviewPatientServiceRequestAction } from "./server-actions";

const requestId = "11111111-1111-4111-8111-111111111111";
function form(decision: string): FormData {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("decision", decision);
  if (decision === "APPROVE") data.set("osmUserId", "22222222-2222-4222-8222-222222222222");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "trusted-reviewer" });
});

describe("Hospital review action feedback", () => {
  it.each([
    ["APPROVE", "อนุมัติคำขอและมอบหมาย อสม. แล้ว"], ["REJECT", "บันทึกผลไม่อนุมัติแล้ว"],
  ])("confirms %s and invalidates both review and Patient readback", async (decision, message) => {
    const result = await reviewPatientServiceRequestAction({ status: "IDLE" }, form(decision));
    expect(result).toMatchObject({ status: "SUCCESS", message: expect.stringContaining(message) });
    expect(mocks.review).toHaveBeenCalledWith({ userId: "trusted-reviewer" }, {
      requestId,
      osmUserId: decision === "APPROVE" ? "22222222-2222-4222-8222-222222222222" : null,
      confirmReassignment: false,
    }, decision);
    expect(mocks.revalidate.mock.calls).toEqual([["/app/patients/service-requests"], ["/app/personal/services"]]);
  });

  it("refreshes persisted status on a concurrent/repeated mutation conflict", async () => {
    mocks.review.mockRejectedValue(new ConflictError("internal conflict details"));
    const state = await reviewPatientServiceRequestAction({ status: "IDLE" }, form("REJECT"));
    expect(state).toMatchObject({ status: "ERROR", conflict: true, message: "คำขอซ้ำหรือสถานะเปลี่ยนไปแล้ว กรุณาตรวจสอบรายการอีกครั้ง" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/patients/service-requests");
    expect(JSON.stringify(state)).not.toContain("internal");
  });

  it.each([new ForbiddenError(), new InfrastructureError("secret backend details")])("keeps non-conflict errors sanitized", async (error) => {
    mocks.review.mockRejectedValue(error);
    const state = await reviewPatientServiceRequestAction({ status: "IDLE" }, form("APPROVE"));
    expect(state.status).toBe("ERROR");
    expect(state).not.toHaveProperty("conflict");
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["DELETE", "WITHDRAW", "START", "STARTED", ""]) ("rejects forged decision %s before calling the service", async (decision) => {
    expect(await reviewPatientServiceRequestAction({ status: "IDLE" }, form(decision))).toMatchObject({ status: "ERROR" });
    expect(mocks.review).not.toHaveBeenCalled();
  });
});
