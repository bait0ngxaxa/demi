import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/shared/errors/application-error";
import type { PersonalWeightGoalDto, PersonalWeightGoalMutationResult } from "../domain/personal-weight-goal";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/personal-weight-goal-query-service", () => ({ getOwnPersonalWeightGoal: mocks.read }));
vi.mock("../services/personal-weight-goal-service", () => ({ createPersonalWeightGoal: mocks.create, updatePersonalWeightGoal: mocks.update, removePersonalWeightGoal: mocks.remove }));
import { createPersonalWeightGoalAction, readPersonalWeightGoalAction, removePersonalWeightGoalAction, updatePersonalWeightGoalAction } from "./server-actions";

const actor = { userId: "actor-id", personId: "person-id", roles: [] };
const goal: PersonalWeightGoalDto = { id: "22222222-2222-4222-8222-222222222222", targetWeightKg: "72.5", targetDate: null, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z" };
const createResult: PersonalWeightGoalMutationResult = { outcome: "CREATED", goal };
function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Weight Goal Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(actor);
  });

  it("bounds and validates read without accepting owner input", async () => {
    mocks.read.mockResolvedValue(goal);
    await expect(readPersonalWeightGoalAction(form())).resolves.toMatchObject({ status: "SUCCESS", currentGoal: goal });
    await expect(readPersonalWeightGoalAction(form({ patientProfileId: "private" }))).resolves.toMatchObject({ status: "ERROR" });
    expect(mocks.actor).toHaveBeenCalledOnce();
  });

  it("maps a created target to safe readback and revalidates the Wellness route", async () => {
    mocks.create.mockResolvedValue(createResult);
    const state = await createPersonalWeightGoalAction({ status: "IDLE" }, form({ submissionNonce: "11111111-1111-4111-8111-111111111111", targetWeightKg: "070.500", targetDate: "" }));
    expect(state).toMatchObject({ status: "SUCCESS", result: createResult });
    expect(mocks.create).toHaveBeenCalledWith(actor, expect.objectContaining({ targetWeightKg: "070.500", targetDate: "" }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/personal/wellness");
  });

  it("keeps consumed and unconfirmed create outcomes distinct and does not claim rejection as mutation", async () => {
    mocks.create.mockResolvedValueOnce({ outcome: "CREATE_CONSUMED" }).mockResolvedValueOnce({ outcome: "UNCONFIRMED" });
    const consumed = await createPersonalWeightGoalAction({ status: "IDLE" }, form({ submissionNonce: "11111111-1111-4111-8111-111111111111", targetWeightKg: "72.5" }));
    const uncertain = await createPersonalWeightGoalAction({ status: "IDLE" }, form({ submissionNonce: "11111111-1111-4111-8111-111111111111", targetWeightKg: "72.5" }));
    expect(consumed).toMatchObject({ status: "CREATE_CONSUMED" });
    expect(consumed.message).toContain("โหลดข้อมูลล่าสุด");
    expect(uncertain).toMatchObject({ status: "UNCONFIRMED" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not authenticate malformed transport and safely denies persisted authorization loss", async () => {
    await expect(createPersonalWeightGoalAction({ status: "IDLE" }, form({ submissionNonce: "11111111-1111-4111-8111-111111111111", targetWeightKg: "123456789012" }))).resolves.toMatchObject({ status: "ERROR" });
    expect(mocks.actor).not.toHaveBeenCalled();
    mocks.read.mockRejectedValue(new ForbiddenError());
    await expect(readPersonalWeightGoalAction(form())).resolves.toMatchObject({ status: "DENIED" });
  });

  it("maps current-version operations and keeps delete payload out of the action result", async () => {
    mocks.update.mockResolvedValue({ outcome: "NOOP", goal });
    const update = await updatePersonalWeightGoalAction({ status: "IDLE" }, form({ goalId: goal.id, expectedUpdatedAt: goal.updatedAt, targetWeightKg: "72.5", targetDate: "" }));
    expect(update).toMatchObject({ status: "SUCCESS", result: { outcome: "NOOP", goal } });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue({ outcome: "DELETED", goalId: goal.id });
    const removed = await removePersonalWeightGoalAction({ status: "IDLE" }, form({ goalId: goal.id, expectedUpdatedAt: goal.updatedAt }));
    expect(removed).toMatchObject({ status: "SUCCESS", result: { outcome: "DELETED", goalId: goal.id } });
    expect(removed).not.toHaveProperty("deletedGoal");
  });
});
