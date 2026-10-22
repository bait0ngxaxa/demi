import { describe, expect, it } from "vitest";

import {
  patientProgramServiceOneConfidenceRequestSchema,
  patientProgramServiceOneDreamCardRequestSchema,
  patientProgramServiceOneFloatingChartRequestSchema,
  patientProgramServiceOneRoutineRequestSchema,
} from "./patient-program-service-one-schemas";

const patientProgramId = "11111111-1111-4111-8111-111111111111";

describe("Patient Program Service 1 schemas", () => {
  it("normalizes optional reflection text and accepts a routine record", () => {
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({ patientProgramId, roundNumber: 1, routineDate: "2026-10-22", entries: [] })
        .success,
    ).toBe(true);
    expect(
      patientProgramServiceOneFloatingChartRequestSchema.parse({
        patientProgramId,
        roundNumber: 4,
        summary: "  สรุปจากกราฟ  ",
      }),
    ).toEqual({ patientProgramId, roundNumber: 4, summary: "สรุปจากกราฟ" });
    expect(
      patientProgramServiceOneDreamCardRequestSchema.parse({
        patientProgramId,
        roundNumber: 3,
        dream: "  อยากไปเที่ยวทะเล  ",
        obstacle: "   ",
        weeklyGoal: " เดินวันละ 10 นาที ",
      }),
    ).toEqual({ patientProgramId, roundNumber: 3, dream: "อยากไปเที่ยวทะเล", obstacle: null, weeklyGoal: "เดินวันละ 10 นาที" });
  });

  it("requires the dream and this week's small goal (R2-G)", () => {
    const card = { patientProgramId, roundNumber: 3, dream: "อยากไปเที่ยวทะเล", weeklyGoal: "เดินวันละ 10 นาที" };

    expect(patientProgramServiceOneDreamCardRequestSchema.safeParse(card).success).toBe(true);
    expect(patientProgramServiceOneDreamCardRequestSchema.safeParse({ ...card, dream: "  " }).success).toBe(false);
    expect(patientProgramServiceOneDreamCardRequestSchema.safeParse({ ...card, weeklyGoal: undefined }).success).toBe(false);
    expect(patientProgramServiceOneDreamCardRequestSchema.safeParse({ ...card, description: "เดิม" }).success).toBe(false);
  });

  it("takes a dated life table of up to 24 rows, each with กิจวัตรประจำวัน (R2-G)", () => {
    const table = { patientProgramId, roundNumber: 1, routineDate: "2026-10-22" };
    const row = { timeText: " 06:00 ", activity: " ตื่นนอน ", adjustment: "" };

    expect(patientProgramServiceOneRoutineRequestSchema.parse({ ...table, entries: [row] }).entries).toEqual([
      { timeText: "06:00", activity: "ตื่นนอน", adjustment: null },
    ]);
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({ ...table, entries: Array.from({ length: 24 }, () => row) }).success,
    ).toBe(true);
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({ ...table, entries: Array.from({ length: 25 }, () => row) }).success,
    ).toBe(false);
    expect(patientProgramServiceOneRoutineRequestSchema.safeParse({ ...table, entries: [{ ...row, activity: " " }] }).success).toBe(
      false,
    );
    expect(patientProgramServiceOneRoutineRequestSchema.safeParse({ patientProgramId, roundNumber: 1, entries: [] }).success).toBe(
      false,
    );
  });

  it("requires a round number 1-6 (SR-D8)", () => {
    expect(patientProgramServiceOneRoutineRequestSchema.safeParse({ patientProgramId }).success).toBe(false);
    expect(patientProgramServiceOneRoutineRequestSchema.safeParse({ patientProgramId, roundNumber: 7 }).success).toBe(false);
  });

  it("rejects unknown fields and text longer than the explicit bound", () => {
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({
        patientProgramId,
        roundNumber: 1,
        routineDate: "2026-10-22",
        entries: [],
        recordedByUserId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
    expect(
      patientProgramServiceOneFloatingChartRequestSchema.safeParse({
        patientProgramId,
        roundNumber: 1,
        summary: "x".repeat(2_001),
      }).success,
    ).toBe(false);
    expect(
      patientProgramServiceOneDreamCardRequestSchema.safeParse({
        patientProgramId,
        roundNumber: 3,
        dream: "x".repeat(1_001),
        weeklyGoal: "เดินวันละ 10 นาที",
      }).success,
    ).toBe(false);
  });

  it.each([0, 10])("accepts confidence score %s", (score) => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.parse({ patientProgramId, roundNumber: 1, score }),
    ).toMatchObject({ patientProgramId, score, improvementPlan: null });
  });

  it.each([-1, 11, 1.5])("rejects confidence score %s", (score) => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.safeParse({ patientProgramId, roundNumber: 1, score })
        .success,
    ).toBe(false);
  });

  it("normalizes an empty confidence plan to null", () => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.parse({
        patientProgramId,
        roundNumber: 1,
        score: 5,
        improvementPlan: "  ",
      }),
    ).toEqual({ patientProgramId, roundNumber: 1, score: 5, improvementPlan: null });
  });
});
