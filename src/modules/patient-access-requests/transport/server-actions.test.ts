import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitPublicPatientAccessRequest: vi.fn(),
  locateHospitalPatientAccessRequest: vi.fn(),
  reviewPatientAccessRequest: vi.fn(),
  withdrawPatientAccessRequestByHospital: vi.fn(),
  getProtectedApplicationActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getProtectedApplicationActor,
}));
vi.mock("../services/patient-access-request-service", () => ({
  submitPublicPatientAccessRequest: mocks.submitPublicPatientAccessRequest,
  locateHospitalPatientAccessRequest: mocks.locateHospitalPatientAccessRequest,
  reviewPatientAccessRequest: mocks.reviewPatientAccessRequest,
  withdrawPatientAccessRequestByHospital: mocks.withdrawPatientAccessRequestByHospital,
}));

import { ConflictError, ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import {
  initialPublicPatientAccessRequestActionState,
  initialPatientAccessRequestReviewActionState,
  initialPatientAccessRequestLookupActionState,
} from "./action-state";
import {
  reviewPatientAccessRequestAction,
  locateHospitalPatientAccessRequestAction,
  submitPublicPatientAccessRequestAction,
} from "./server-actions";

const nationalId = "1000000000009";
const hospitalId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function publicForm(): FormData {
  const data = new FormData();
  data.set("nationalId", nationalId);
  data.set("hospitalId", hospitalId);
  return data;
}

describe("Patient access request Server Actions", () => {
  it("does not invoke lookup without an authenticated actor", async () => {
    mocks.getProtectedApplicationActor.mockRejectedValueOnce(new UnauthenticatedError());
    const result = await locateHospitalPatientAccessRequestAction(initialPatientAccessRequestLookupActionState, publicForm());
    expect(result).toEqual({ status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ค้นหาคำขอในโรงพยาบาลนี้" });
    expect(mocks.locateHospitalPatientAccessRequest).not.toHaveBeenCalled();
  });
  it("authenticates lookup and projects only requestId without identity or verification state", async () => {
    mocks.locateHospitalPatientAccessRequest.mockResolvedValue({ requestId, status: "PENDING", identityKeyHash: "must-not-serialize" });
    const result = await locateHospitalPatientAccessRequestAction(initialPatientAccessRequestLookupActionState, publicForm());
    expect(mocks.getProtectedApplicationActor).toHaveBeenCalled();
    expect(result).toEqual({ status: "SUCCESS", requestId });
    expect(mocks.reviewPatientAccessRequest).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([null, new ForbiddenError(), new ValidationError()])("returns sanitized lookup errors", async (failure) => {
    if (failure) mocks.locateHospitalPatientAccessRequest.mockRejectedValue(failure);
    else mocks.locateHospitalPatientAccessRequest.mockResolvedValue(null);
    const result = await locateHospitalPatientAccessRequestAction(initialPatientAccessRequestLookupActionState, publicForm());
    expect(result.status).toBe("ERROR");
    expect(JSON.stringify(result)).not.toMatch(/1000000000009|identityKeyHash|authSubject/);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitPublicPatientAccessRequest.mockResolvedValue(undefined);
    mocks.getProtectedApplicationActor.mockResolvedValue({ userId: "reviewer" });
    mocks.reviewPatientAccessRequest.mockResolvedValue({ status: "APPROVED", resolution: null });
  });

  it("returns the same generic success state for first and repeated public submissions", async () => {
    const first = await submitPublicPatientAccessRequestAction(
      initialPublicPatientAccessRequestActionState,
      publicForm(),
    );
    mocks.submitPublicPatientAccessRequest.mockRejectedValueOnce(new ConflictError("duplicate"));
    const repeated = await submitPublicPatientAccessRequestAction(
      initialPublicPatientAccessRequestActionState,
      publicForm(),
    );

    expect(first).toEqual({ status: "SUCCESS" });
    expect(repeated).toEqual(first);
    expect(JSON.stringify([first, repeated])).not.toContain(nationalId);
    expect(JSON.stringify([first, repeated])).not.toContain(requestId);
  });

  it("requires the Hospital verification attestation at the review boundary", async () => {
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("decision", "APPROVE");
    form.set("nationalId", nationalId);

    const result = await reviewPatientAccessRequestAction(
      initialPatientAccessRequestReviewActionState,
      form,
    );

    expect(result.status).toBe("ERROR");
    expect(mocks.reviewPatientAccessRequest).not.toHaveBeenCalled();
  });
});
