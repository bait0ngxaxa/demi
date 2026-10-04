import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { decodeExerciseCursor, encodeExerciseCursor } from "@/modules/exercises/services/personal-exercise-cursor";
import { decodeMealCursor, encodeMealCursor } from "@/modules/meals/services/personal-meal-cursor";

const actor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: ["PATIENT"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const anchor = {
  version: 1 as const,
  patientProfileId: "33333333-3333-4333-8333-333333333333",
  id: "44444444-4444-4444-8444-444444444444",
  occurredOn: "2026-10-03",
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

describe("Wellness cursor domain separation", () => {
  it("rejects Meal cursors in Exercise and Exercise cursors in Meal", () => {
    const mealCursor = encodeMealCursor(actor, anchor);
    const exerciseCursor = encodeExerciseCursor(actor, anchor);

    expect(() => decodeExerciseCursor(actor, anchor.patientProfileId, mealCursor)).toThrow();
    expect(() => decodeMealCursor(actor, anchor.patientProfileId, exerciseCursor)).toThrow();
  });
});
