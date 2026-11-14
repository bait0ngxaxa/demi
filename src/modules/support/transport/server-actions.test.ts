import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getActor: vi.fn(), create: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: () => mocks.getActor() }));
vi.mock("../services/support-report-service", async () => {
  const { ConflictError } = await import("@/shared/errors/application-error");
  class SupportReportRateLimitError extends ConflictError {}
  return { createSupportReport: mocks.create, updateAdminSupportReportStatus: mocks.update, SupportReportRateLimitError };
});

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE } from "../domain/support-report-messages";
import { createSupportReportAction, updateSupportReportStatusAction } from "./server-actions";

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

  it("revalidates the shared application layout after a successful status mutation", async () => {
    mocks.update.mockResolvedValue({ status: "ACKNOWLEDGED" });
    expect(await updateSupportReportStatusAction({ reportId: "report", status: "ACKNOWLEDGED" })).toEqual({ status: "SUCCESS", reportId: "report" });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidate.mock.invocationCallOrder[0] ?? Infinity);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
  });

  it("does not revalidate or report success when authorization fails", async () => {
    mocks.update.mockRejectedValue(new ForbiddenError());
    expect(await updateSupportReportStatusAction({ reportId: "report" })).toMatchObject({ status: "ERROR", code: "FORBIDDEN" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
