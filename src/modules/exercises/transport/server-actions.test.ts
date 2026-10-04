import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";
import { ExerciseCreateConsumedError } from "../domain/exercise-create-consumed-error";
const mock = vi.hoisted(() => ({ actor: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mock.actor }));
vi.mock("../services/personal-exercise-service", () => ({ createPersonalExercise: mock.create, updatePersonalExercise: mock.update, deletePersonalExercise: mock.remove }));
vi.mock("../services/personal-exercise-query-service", () => ({ listOwnPersonalExercises: mock.list }));
import { createPersonalExerciseAction, updatePersonalExerciseAction, deletePersonalExerciseAction, listPersonalExercisesAction } from "./server-actions";
const row = { id: "11111111-1111-4111-8111-111111111111", activityName: "เดิน", durationMinutes: null, occurredOn: "2026-10-03", note: "ข้อมูลไทย", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
function form(values: Record<string, string>): FormData { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
const createInput = { submissionNonce: row.id, activityName: row.activityName, occurredOn: row.occurredOn, note: row.note };
const version = { entryId: row.id, expectedUpdatedAt: row.updatedAt };
describe("Exercise Server Action boundary", () => {
  it("distinguishes consumed create safely from same-request retryable conflicts", async () => {
    mock.create.mockRejectedValue(new ExerciseCreateConsumedError());
    const consumed = await createPersonalExerciseAction({ status: "IDLE" }, form(createInput));
    expect(consumed.status).toBe("CREATE_CONSUMED");
    expect(consumed.message).toContain("เริ่มบันทึกใหม่");
    for (const text of ["ลองคำขอเดิม", "ลบ", "receipt", row.id, "patientProfileId"]) expect(consumed.message).not.toContain(text);
    expect(consumed.result).toBeUndefined(); expect(mock.revalidate).not.toHaveBeenCalled();
    mock.create.mockRejectedValue(new ConflictError());
    const retryable = await createPersonalExerciseAction({ status: "IDLE" }, form(createInput));
    expect(retryable.status).toBe("CONFLICT"); expect(retryable.message).toContain("ลองคำขอเดิมอีกครั้ง");
  });
  beforeEach(() => { vi.clearAllMocks(); mock.actor.mockResolvedValue({ userId: "actor" }); });
  it("bounds unknown/duplicate/File/oversize before actor/service, never drops owner fields", async () => {
    const bad = [form({ ...createInput, patientProfileId: row.id }), form({ ...createInput, note: "ก".repeat(17000) })];
    const duplicate = form(createInput); duplicate.append("activityName", "วิ่ง"); bad.push(duplicate);
    const file = form(createInput); file.set("note", new Blob(["sensitive"]), "file.txt"); bad.push(file);
    for (const input of bad) expect((await createPersonalExerciseAction({ status: "IDLE" }, input)).status).toBe("ERROR");
    expect(mock.actor).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it("reports field validation safely with no sensitive submitted content", async () => {
    const result = await createPersonalExerciseAction({ status: "IDLE" }, form({ ...createInput, activityName: " ", note: "secret".repeat(200) }));
    expect(result.status).toBe("ERROR"); expect(result.fieldErrors?.activityName).toBeTruthy(); expect(result.fieldErrors?.note).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("secret");
  });
  it.each(["CREATED", "REPLAY", "NOOP"])("returns %s authoritative readback, distinct message and scoped invalidation", async (outcome) => {
    mock.create.mockResolvedValue({ outcome, item: row });
    const result = await createPersonalExerciseAction({ status: "IDLE" }, form(createInput));
    expect(result).toMatchObject({ status: "SUCCESS", result: { outcome, item: row } }); expect(mock.revalidate).toHaveBeenCalledWith("/app/personal/wellness");
    if (outcome === "REPLAY") expect(result.message).toContain("ดำเนินการแล้ว");
    if (outcome === "NOOP") expect(result.message).toContain("ไม่มีการเปลี่ยนแปลง");
  });
  it("converts strict duration to typed service input without sensitive validation leaks", async () => {
    mock.create.mockResolvedValue({ outcome: "CREATED", item: { ...row, durationMinutes: 1 } });
    expect((await createPersonalExerciseAction({ status: "IDLE" }, form({ ...createInput, durationMinutes: "0001" }))).status).toBe("SUCCESS");
    expect(mock.create).toHaveBeenCalledWith({ userId: "actor" }, { ...createInput, durationMinutes: 1 });
    mock.create.mockClear();
    for (const durationMinutes of ["1.0", "1e2", "1000001", "private invalid text"]) {
      const result = await createPersonalExerciseAction({ status: "IDLE" }, form({ ...createInput, durationMinutes }));
      expect(result.status).toBe("ERROR"); expect(JSON.stringify(result)).not.toContain(durationMinutes);
    }
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("edit/delete use explicit version; list cursor stays private transport", async () => {
    mock.update.mockResolvedValue({ outcome: "UPDATED", item: row }); mock.remove.mockResolvedValue({ outcome: "DELETED", entryId: row.id }); mock.list.mockResolvedValue({ items: [row], nextCursor: null });
    expect((await updatePersonalExerciseAction({ status: "IDLE" }, form({ ...version, activityName: row.activityName, occurredOn: row.occurredOn }))).status).toBe("SUCCESS");
    expect((await deletePersonalExerciseAction({ status: "IDLE" }, form(version))).status).toBe("SUCCESS");
    expect(await listPersonalExercisesAction(form({ cursor: "opaque" }))).toEqual({ status: "SUCCESS", page: { items: [row], nextCursor: null } });
    expect(mock.list).toHaveBeenCalledWith({ userId: "actor" }, { cursor: "opaque" });
  });
  it.each([{ error: new ConflictError(), status: "CONFLICT" }, { error: new NotFoundError(), status: "CONFLICT" }, { error: new ForbiddenError(), status: "DENIED" }, { error: new InfrastructureError("secret SQL"), status: "UNCONFIRMED" }, { error: new Error("secret payload"), status: "UNCONFIRMED" }])("safe $status outcome, no false success/invalidation", async ({ error, status }) => {
    mock.create.mockRejectedValue(error); const result = await createPersonalExerciseAction({ status: "IDLE" }, form(createInput));
    expect(result.status).toBe(status); expect(JSON.stringify(result)).not.toContain("secret"); expect(result.result).toBeUndefined(); expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
