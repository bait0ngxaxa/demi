import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitPublicPatientAccessRequest: vi.fn(),
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
  reviewPatientAccessRequest: mocks.reviewPatientAccessRequest,
  withdrawPatientAccessRequestByHospital: mocks.withdrawPatientAccessRequestByHospital,
}));

import { ConflictError } from "@/shared/errors/application-error";

import {
  initialPublicPatientAccessRequestActionState,
  initialPatientAccessRequestReviewActionState,
} from "./action-state";
import {
  reviewPatientAccessRequestAction,
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
