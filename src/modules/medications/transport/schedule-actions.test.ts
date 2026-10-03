import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { replacePersonalMedicationSchedules } from "../services/personal-medication-service";
import { replacePersonalMedicationSchedulesAction as action } from "./server-actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("../services/personal-medication-service", () => ({ replacePersonalMedicationSchedules: vi.fn() }));
const actor = { userId: "user", personId: "person", roles: ["PATIENT" as const], hospitalMemberships: [], osmHospitalRelationships: [] };
const version = { medicationId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" };
function form(times = "[]"): FormData {
  const data = new FormData(); for (const [key, value] of Object.entries({ ...version, times })) data.set(key, value); return data;
}
describe("schedule action", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor); });
  it("authenticates, passes raw parsed times for service validation and revalidates after commit", async () => {
    vi.mocked(replacePersonalMedicationSchedules).mockResolvedValue({ id: version.medicationId, medicationName: "ยาไทย", instructionText: null, status: "ACTIVE", stoppedAt: null, createdAt: version.expectedUpdatedAt, updatedAt: version.expectedUpdatedAt, schedules: [{ localTime: "08:00" }] });
    expect((await action({ status: "IDLE" }, form('["20:00","08:00"]'))).status).toBe("SUCCESS");
    expect(replacePersonalMedicationSchedules).toHaveBeenCalledExactlyOnceWith(actor, { ...version, times: ["20:00", "08:00"] });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/app/personal/medications");
    expect(vi.mocked(revalidatePath).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(replacePersonalMedicationSchedules).mock.invocationCallOrder[0]);
  });
  it.each(["[", "null", "{}", '[1]', '["08:00","08:00"]', '["08:00:00"]'])("rejects invalid %s safely", async (times) => {
    expect((await action({ status: "IDLE" }, form(times))).status).toBe("ERROR"); expect(replacePersonalMedicationSchedules).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each([new ConflictError(), new ForbiddenError(), new NotFoundError(), new ValidationError(), new Error("private SQL clock values")])("maps errors without leaking content or automatic replay", async (error) => {
    vi.mocked(replacePersonalMedicationSchedules).mockRejectedValue(error);
    const result = await action({ status: "IDLE" }, form());
    expect(result.status).toBe(error instanceof ConflictError ? "CONFLICT" : "ERROR");
    expect(JSON.stringify(result)).not.toContain("private"); expect(replacePersonalMedicationSchedules).toHaveBeenCalledOnce(); expect(revalidatePath).not.toHaveBeenCalled();
    if (!(error instanceof ConflictError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ValidationError)) expect(result.refreshRequired).toBe(true);
  });
});
