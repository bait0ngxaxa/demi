import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { createPersonalMedication, updatePersonalMedication, stopPersonalMedication } from "../services/personal-medication-service";
import { createPersonalMedicationAction as create, updatePersonalMedicationAction as update, stopPersonalMedicationAction as stop } from "./server-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("../services/personal-medication-service", () => ({ createPersonalMedication: vi.fn(), updatePersonalMedication: vi.fn(), stopPersonalMedication: vi.fn() }));
const item = { id: "11111111-1111-4111-8111-111111111111", medicationName: "ยา", instructionText: null, status: "ACTIVE" as const, stoppedAt: null, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" };
const actor = { userId: "user", personId: "person", roles: ["PATIENT" as const], hospitalMemberships: [], osmHospitalRelationships: [] };
function form(values: Record<string, string>): FormData { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
const version = { medicationId: item.id, expectedUpdatedAt: item.updatedAt };
describe("medication actions", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor); for (const operation of [createPersonalMedication, updatePersonalMedication, stopPersonalMedication]) vi.mocked(operation).mockResolvedValue(item); });
  it.each([[create, createPersonalMedication, { medicationName: "ยา" }], [update, updatePersonalMedication, { ...version, medicationName: "ยา" }], [stop, stopPersonalMedication, version]] as const)("authenticates and refreshes only medication path after commit", async (action, service, input) => {
    expect((await action({ status: "IDLE" }, form(input))).status).toBe("SUCCESS");
    expect(service).toHaveBeenCalledWith(actor, input);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/app/personal/medications");
  });
  it("rejects unknown owner/system fields and duplicated transport values", async () => {
    expect((await create({ status: "IDLE" }, form({ medicationName: "ยา", patientProfileId: "foreign" }))).status).toBe("ERROR");
    const duplicate = form({ medicationName: "ยา" }); duplicate.append("medicationName", "อีกชื่อ");
    expect((await create({ status: "IDLE" }, duplicate)).status).toBe("ERROR");
    expect(createPersonalMedication).not.toHaveBeenCalled();
  });
  it("returns associated bounded field errors without reflecting medication text", async () => {
    const state = await create({ status: "IDLE" }, form({ medicationName: " ", instructionText: "ลับ".repeat(1000) }));
    expect(state.fieldErrors?.medicationName).toBeTruthy(); expect(state.fieldErrors?.instructionText).toBeTruthy();
    expect(JSON.stringify(state)).not.toContain("ลับ");
  });
  it.each([new ConflictError(), new ForbiddenError(), new NotFoundError(), new ValidationError(), new Error("SQL private")])("maps safe errors and does not revalidate/retry failure", async (error) => {
    vi.mocked(createPersonalMedication).mockRejectedValue(error);
    const state = await create({ status: "IDLE" }, form({ medicationName: "ยา" }));
    expect(state.status).toBe(error instanceof ConflictError ? "CONFLICT" : "ERROR");
    expect(JSON.stringify(state)).not.toContain("SQL private");
    expect(createPersonalMedication).toHaveBeenCalledTimes(1); expect(revalidatePath).not.toHaveBeenCalled();
    if (!(error instanceof ConflictError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ValidationError)) expect(state.refreshRequired).toBe(true);
  });
});
