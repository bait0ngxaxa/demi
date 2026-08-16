import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedCreate = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/goal-service", () => ({
  createGoalPlan: mockedCreate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));

import { initialGoalPlanActionState } from "./action-state";
import * as serverActions from "./server-actions";
import { submitGoalPlanAction } from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";
const goalPlanId = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function goalPlanFormData(): FormData {
  const data = new FormData();
  data.set("patientHospitalRelationshipId", relationshipId);
  data.set("submissionNonce", nonce);
  data.set("sourceScreeningAssessmentId", "");
  data.set("primaryGoalCode", "weight");
  data.set("primaryGoalNote", "หมายเหตุต้นแบบ");
  data.set("weeklyNote", "บันทึกรายสัปดาห์");
  data.set(
    "items",
    JSON.stringify([
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ]),
  );
  return data;
}

describe("Goal Plan Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedCreate.mockResolvedValue({
      goalPlanId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "66666666-6666-4666-8666-666666666666",
      roundNumber: 1,
      createdAt: new Date("2026-08-16T05:00:00.000Z"),
    });
  });

  it("exports only the async Server Action", () => {
    expect(Object.keys(serverActions)).toEqual(["submitGoalPlanAction"]);
    expect(serverActions.submitGoalPlanAction.constructor.name).toBe("AsyncFunction");
  });

  it("passes only raw form data and opaque references to the service", async () => {
    const result = await submitGoalPlanAction(initialGoalPlanActionState, goalPlanFormData());

    expect(result).toMatchObject({ status: "SUCCESS", result: { goalPlanId, roundNumber: 1 } });
    expect(mockedCreate).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      submissionNonce: nonce,
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: "หมายเหตุต้นแบบ",
      weeklyNote: "บันทึกรายสัปดาห์",
      items: [
        { activityCode: "stop_sweet", targetDays: 4 },
        { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
      ],
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}/goals`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}/goals/${goalPlanId}`);
  });

  it.each(["unknown field", "duplicate item field", "authority field"]) (
    "rejects %s before invoking the service",
    async (caseName) => {
      const data = goalPlanFormData();

      if (caseName === "unknown field") {
        data.set("hospitalId", "77777777-7777-4777-8777-777777777777");
      }

      if (caseName === "duplicate item field") {
        data.append("items", "[]");
      }

      if (caseName === "authority field") {
        data.set("createdByUserId", actor.userId);
      }

      const result = await submitGoalPlanAction(initialGoalPlanActionState, data);

      expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedCreate).not.toHaveBeenCalled();
    },
  );

  it("maps a forbidden server decision to a safe user-facing error", async () => {
    mockedCreate.mockRejectedValue(new ForbiddenError());

    await expect(submitGoalPlanAction(initialGoalPlanActionState, goalPlanFormData())).resolves.toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์สร้าง Goal Plan สำหรับผู้ป่วยรายนี้",
    });
  });
});

