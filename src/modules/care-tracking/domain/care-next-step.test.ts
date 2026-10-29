import { describe, expect, it } from "vitest";

import type { ProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";

import { resolvePatientCareNextStep, type PatientCareNextStepInput } from "./care-next-step";

const activeProgram = { programId: "program-1", canManage: true };

function roundsOverview(
  states: readonly ("LOCKED" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED")[],
  after: ProgramRoundsOverview["after"]["state"] = "LOCKED",
): ProgramCareRoundsOverview {
  return {
    rounds: states.map((state, index) => ({
      roundNumber: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      title: `ครั้งที่ ${index + 1}`,
      state,
      resolvedItems: state === "COMPLETED" ? 1 : 0,
      totalItems: 1,
      completedAt: null,
      completedByDisplayName: null,
    })),
    after: { state: after, date: null, recordedByDisplayName: null },
  };
}

type ProgramCareRoundsOverview = Pick<ProgramRoundsOverview, "rounds" | "after">;

function resolve(overrides: Partial<PatientCareNextStepInput> = {}) {
  return resolvePatientCareNextStep({
    access: "DIRECT",
    baselineExists: true,
    canCreateBaseline: false,
    activeProgram: null,
    canOpenProgram: false,
    roundsOverview: null,
    ...overrides,
  });
}

describe("resolvePatientCareNextStep", () => {
  it.each([
    {
      label: "network read access takes precedence over available write flags",
      input: { access: "NETWORK" as const, canCreateBaseline: true, canOpenProgram: true },
      expected: { type: "NONE", reason: "READ_ONLY" },
    },
    {
      label: "no write permission returns no CTA",
      input: { canCreateBaseline: false, canOpenProgram: false },
      expected: { type: "NONE", reason: "READ_ONLY" },
    },
    {
      label: "a missing Baseline is recommended before opening a Program",
      input: { baselineExists: false, canCreateBaseline: true, canOpenProgram: true },
      expected: { type: "BASELINE" },
    },
    {
      label: "an existing Baseline allows the Program open control",
      input: { baselineExists: true, canOpenProgram: true },
      expected: { type: "OPEN_PROGRAM" },
    },
    {
      label: "a missing but unavailable Baseline does not block opening a Program",
      input: { baselineExists: false, canCreateBaseline: false, canOpenProgram: true },
      expected: { type: "OPEN_PROGRAM" },
    },
    {
      label: "no active Program and no allowed write action returns no CTA",
      input: { baselineExists: true, canCreateBaseline: false, canOpenProgram: false },
      expected: { type: "NONE", reason: "READ_ONLY" },
    },
    {
      label: "an existing Baseline with no Program-open permission has no next action",
      input: { baselineExists: true, canCreateBaseline: true, canOpenProgram: false },
      expected: { type: "NONE", reason: "NO_ACTION" },
    },
  ])("returns the expected action when $label", ({ input, expected }) => {
    expect(resolve(input)).toEqual(expected);
  });

  it("starts the first incomplete NOT_STARTED round", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(["NOT_STARTED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]),
    })).toEqual({ type: "ROUND", programId: "program-1", roundNumber: 1, state: "NOT_STARTED" });
  });

  it("continues the first incomplete IN_PROGRESS round even if the summaries arrive out of order", () => {
    const overview = roundsOverview(["COMPLETED", "IN_PROGRESS", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
    expect(resolve({
      activeProgram,
      roundsOverview: { ...overview, rounds: [...overview.rounds].reverse() },
    })).toEqual({ type: "ROUND", programId: "program-1", roundNumber: 2, state: "IN_PROGRESS" });
  });

  it("links to the rounds overview when the round summary is unavailable", () => {
    expect(resolve({ activeProgram })).toEqual({ type: "ROUNDS_OVERVIEW", programId: "program-1" });
  });

  it("links to After when all six rounds are complete and After is not recorded", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"], "NOT_RECORDED"),
    })).toEqual({ type: "AFTER", programId: "program-1" });
  });

  it("links to the Program after After has been recorded", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"], "RECORDED"),
    })).toEqual({ type: "PROGRAM", programId: "program-1" });
  });

  it("does not open After when a complete round summary still reports After as locked", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"]),
    })).toEqual({ type: "ROUNDS_OVERVIEW", programId: "program-1" });
  });

  it("does not treat a partial round list as a completed care journey", () => {
    const overview = roundsOverview(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"], "NOT_RECORDED");
    expect(resolve({ activeProgram, roundsOverview: overview })).toEqual({ type: "ROUNDS_OVERVIEW", programId: "program-1" });
  });

  it("links to After when seven opened rounds are all complete (ADR-0022 rounds 7-12)", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(Array.from({ length: 7 }, () => "COMPLETED" as const), "NOT_RECORDED"),
    })).toEqual({ type: "AFTER", programId: "program-1" });
  });

  it("links to the Program after After was recorded following twelve rounds", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview(Array.from({ length: 12 }, () => "COMPLETED" as const), "RECORDED"),
    })).toEqual({ type: "PROGRAM", programId: "program-1" });
  });

  it("continues an open extra round before After", () => {
    expect(resolve({
      activeProgram,
      roundsOverview: roundsOverview([...Array.from({ length: 6 }, () => "COMPLETED" as const), "IN_PROGRESS"], "LOCKED"),
    })).toEqual({ type: "ROUND", programId: "program-1", roundNumber: 7, state: "IN_PROGRESS" });
  });

  it("does not offer the active Program when its manage permission is absent", () => {
    expect(resolve({
      activeProgram: { programId: "program-1", canManage: false },
      canCreateBaseline: true,
      roundsOverview: roundsOverview(["NOT_STARTED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]),
    })).toEqual({ type: "NONE", reason: "PROGRAM_NOT_MANAGEABLE" });
  });
});
