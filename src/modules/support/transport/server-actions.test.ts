import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getActor: vi.fn(), create: vi.fn() }));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: () => mocks.getActor() }));
vi.mock("../services/support-report-service", async () => {
  const { ConflictError } = await import("@/shared/errors/application-error");
  class SupportReportRateLimitError extends ConflictError {}
  return { createSupportReport: mocks.create, updateAdminSupportReportStatus: vi.fn(), SupportReportRateLimitError };
});

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE } from "../domain/support-report-messages";
import { createSupportReportAction } from "./server-actions";

describe("createSupportReportAction refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ userId: "u", personId: "p", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] });
  });

  it.each([
    ["a refused submitter or out-of-scope Hospital", () => mocks.create.mockRejectedValue(new ForbiddenError())],
    ["an unauthenticated request", () => mocks.getActor.mockRejectedValue(new UnauthenticatedError())],
  ])("returns the single shared FORBIDDEN message for %s", async (_label, arrange) => {
    arrange();

    await expect(createSupportReportAction({ category: "BUG", message: "ทดสอบ" })).resolves.toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE,
    });
  });
});
