import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";
import { MealCreateConsumedError } from "../domain/meal-create-consumed-error";
const mock = vi.hoisted(() => ({ actor: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mock.actor }));
vi.mock("../services/personal-meal-service", () => ({ createPersonalMeal: mock.create, updatePersonalMeal: mock.update, deletePersonalMeal: mock.remove }));
vi.mock("../services/personal-meal-query-service", () => ({ listOwnPersonalMeals: mock.list }));
import { createPersonalMealAction, updatePersonalMealAction, deletePersonalMealAction, listPersonalMealsAction } from "./server-actions";
const row = { id: "11111111-1111-4111-8111-111111111111", category: "SNACK", occurredOn: "2026-10-03", description: "ข้อมูลไทย", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
function form(values: Record<string, string>): FormData { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
const createInput = { submissionNonce: row.id, category: row.category, occurredOn: row.occurredOn, description: row.description };
const version = { entryId: row.id, expectedUpdatedAt: row.updatedAt };
describe("Meal Server Action boundary", () => {
  it("distinguishes consumed create safely from same-request retryable conflicts", async () => {
    mock.create.mockRejectedValue(new MealCreateConsumedError());
    const consumed = await createPersonalMealAction({ status: "IDLE" }, form(createInput));
    expect(consumed.status).toBe("CREATE_CONSUMED");
    expect(consumed.message).toContain("เริ่มบันทึกใหม่");
    for (const text of ["ลองคำขอเดิม", "ลบ", "receipt", row.id, "patientProfileId"]) expect(consumed.message).not.toContain(text);
    expect(consumed.result).toBeUndefined(); expect(mock.revalidate).not.toHaveBeenCalled();
    mock.create.mockRejectedValue(new ConflictError());
    const retryable = await createPersonalMealAction({ status: "IDLE" }, form(createInput));
    expect(retryable.status).toBe("CONFLICT"); expect(retryable.message).toContain("ลองคำขอเดิมอีกครั้ง");
  });
  beforeEach(() => { vi.clearAllMocks(); mock.actor.mockResolvedValue({ userId: "actor" }); });
  it("bounds unknown/duplicate/File/oversize before actor/service, never drops owner fields", async () => {
    const bad = [form({ ...createInput, patientProfileId: row.id }), form({ ...createInput, description: "ก".repeat(17000) })];
    const duplicate = form(createInput); duplicate.append("category", "LUNCH"); bad.push(duplicate);
    const file = form(createInput); file.set("description", new Blob(["sensitive"]), "file.txt"); bad.push(file);
    for (const input of bad) expect((await createPersonalMealAction({ status: "IDLE" }, input)).status).toBe("ERROR");
    expect(mock.actor).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it("reports field validation safely with no sensitive submitted content", async () => {
    const result = await createPersonalMealAction({ status: "IDLE" }, form({ ...createInput, category: "OTHER", description: "secret".repeat(200) }));
    expect(result.status).toBe("ERROR"); expect(result.fieldErrors?.category).toBeTruthy(); expect(result.fieldErrors?.description).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("secret");
  });
  it.each(["CREATED", "REPLAY", "NOOP"])("returns %s authoritative readback, distinct message and scoped invalidation", async (outcome) => {
    mock.create.mockResolvedValue({ outcome, item: row });
    const result = await createPersonalMealAction({ status: "IDLE" }, form(createInput));
    expect(result).toMatchObject({ status: "SUCCESS", result: { outcome, item: row } }); expect(mock.revalidate).toHaveBeenCalledWith("/app/personal/wellness");
    if (outcome === "REPLAY") expect(result.message).toContain("ดำเนินการแล้ว");
    if (outcome === "NOOP") expect(result.message).toContain("ไม่มีการเปลี่ยนแปลง");
  });
  it("edit/delete use explicit version; list cursor stays private transport", async () => {
    mock.update.mockResolvedValue({ outcome: "UPDATED", item: row }); mock.remove.mockResolvedValue({ outcome: "DELETED", entryId: row.id }); mock.list.mockResolvedValue({ items: [row], nextCursor: null });
    expect((await updatePersonalMealAction({ status: "IDLE" }, form({ ...version, category: row.category, occurredOn: row.occurredOn }))).status).toBe("SUCCESS");
    expect((await deletePersonalMealAction({ status: "IDLE" }, form(version))).status).toBe("SUCCESS");
    expect(await listPersonalMealsAction(form({ cursor: "opaque" }))).toEqual({ status: "SUCCESS", page: { items: [row], nextCursor: null } });
    expect(mock.list).toHaveBeenCalledWith({ userId: "actor" }, { cursor: "opaque" });
  });
  it.each([{ error: new ConflictError(), status: "CONFLICT" }, { error: new NotFoundError(), status: "CONFLICT" }, { error: new ForbiddenError(), status: "DENIED" }, { error: new InfrastructureError("secret SQL"), status: "UNCONFIRMED" }, { error: new Error("secret payload"), status: "UNCONFIRMED" }])("safe $status outcome, no false success/invalidation", async ({ error, status }) => {
    mock.create.mockRejectedValue(error); const result = await createPersonalMealAction({ status: "IDLE" }, form(createInput));
    expect(result.status).toBe(status); expect(JSON.stringify(result)).not.toContain("secret"); expect(result.result).toBeUndefined(); expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
