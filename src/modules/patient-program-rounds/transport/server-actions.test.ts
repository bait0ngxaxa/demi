import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedVitals = vi.hoisted(() => vi.fn());
const mockedReview = vi.hoisted(() => vi.fn());
const mockedSkip = vi.hoisted(() => vi.fn());
const mockedComplete = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/round-service", () => ({
  recordPatientProgramRoundVitals: mockedVitals,
  recordPatientProgramRoundReview: mockedReview,
  recordPatientProgramRoundProfile: vi.fn(),
  skipPatientProgramRoundStep: mockedSkip,
  unskipPatientProgramRoundStep: vi.fn(),
  completePatientProgramRound: mockedComplete,
}));

import { initialPatientProgramRoundActionState } from "./action-state";
import { RoundConflictError } from "../domain/round-conflict-error";
import {
  completePatientProgramRoundAction,
  recordPatientProgramRoundReviewAction,
  recordPatientProgramRoundVitalsAction,
  skipPatientProgramRoundStepAction,
} from "./server-actions";

const programId = "33333333-3333-4333-8333-333333333333";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const nonce = "77777777-7777-4777-8777-777777777777";
const actor = { userId: "44444444-4444-4444-8444-444444444444" };

function vitalsForm(extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    patientHospitalRelationshipId: relationshipId,
    patientProgramId: programId,
    roundNumber: "1",
    submissionNonce: nonce,
    serviceDate: "2026-10-14",
    weight: "70.5",
    heightCm: "160",
    waistCircumference: "",
    ...extra,
  };

  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

function reviewForm(extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    patientHospitalRelationshipId: relationshipId,
    patientProgramId: programId,
    roundNumber: "3",
    toolCode: "PAM",
    submissionNonce: nonce,
    ...extra,
  };

  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

describe("Program round Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedVitals.mockResolvedValue({
      operation: "RECORDED",
      roundVitalsId: "66666666-6666-4666-8666-666666666666",
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: 1,
    });
    mockedReview.mockResolvedValue({
      operation: "RECORDED",
      roundActivityId: "66666666-6666-4666-8666-666666666666",
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: 3,
      toolCode: "PAM",
      source: "EXTRA",
    });
    const written = { operation: "RECORDED", patientProgramId: programId, patientHospitalRelationshipId: relationshipId, roundNumber: 1 };
    mockedSkip.mockResolvedValue(written);
    mockedComplete.mockResolvedValue(written);
  });

  it("passes only the narrow vitals payload with the actor resolved on the server", async () => {
    const state = await recordPatientProgramRoundVitalsAction(initialPatientProgramRoundActionState, vitalsForm());

    expect(state).toMatchObject({ status: "SUCCESS", result: { operation: "RECORDED", roundNumber: 1 } });
    expect(mockedVitals).toHaveBeenCalledWith(actor, {
      patientProgramId: programId,
      roundNumber: 1,
      submissionNonce: nonce,
      serviceDate: "2026-10-14",
      weight: 70.5,
      heightCm: 160,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      preferredName: null,
      occupation: null,
      profileVersion: null,
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}/programs/${programId}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      `/app/patients/${relationshipId}/programs/${programId}/rounds`,
      "layout",
    );
  });

  it("rejects unexpected, duplicate and client-asserted authority fields before calling the service", async () => {
    const forbiddenExtras: Record<string, string>[] = [{ recordedByUserId: actor.userId }, { hospitalId: "x" }];

    for (const extra of forbiddenExtras) {
      await expect(
        recordPatientProgramRoundVitalsAction(initialPatientProgramRoundActionState, vitalsForm(extra)),
      ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    }

    const duplicate = vitalsForm();
    duplicate.append("weight", "99");
    await expect(
      recordPatientProgramRoundVitalsAction(initialPatientProgramRoundActionState, duplicate),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    await expect(
      recordPatientProgramRoundVitalsAction(initialPatientProgramRoundActionState, vitalsForm({ roundNumber: "3" })),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedVitals).not.toHaveBeenCalled();
  });

  it("does not accept a client-chosen source or mode for a review", async () => {
    await expect(
      recordPatientProgramRoundReviewAction(initialPatientProgramRoundActionState, reviewForm({ source: "EXTRA" })),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    await expect(
      recordPatientProgramRoundReviewAction(initialPatientProgramRoundActionState, reviewForm({ toolCode: "KNOW_SELF" })),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedReview).not.toHaveBeenCalled();

    await expect(
      recordPatientProgramRoundReviewAction(initialPatientProgramRoundActionState, reviewForm()),
    ).resolves.toMatchObject({ status: "SUCCESS", result: { roundNumber: 3 } });
    expect(mockedReview).toHaveBeenCalledWith(actor, {
      patientProgramId: programId,
      roundNumber: 3,
      toolCode: "PAM",
      submissionNonce: nonce,
    });
  });

  it("requires a reason for a skip and a note for OTHER before calling the service", async () => {
    const skipForm = (extra: Record<string, string>) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries({ patientProgramId: programId, roundNumber: "1", stepCode: "PAM", ...extra })) {
        formData.append(key, value);
      }
      return formData;
    };

    await expect(skipPatientProgramRoundStepAction(initialPatientProgramRoundActionState, skipForm({}))).resolves.toMatchObject({
      status: "ERROR",
      code: "INVALID_INPUT",
    });
    await expect(
      skipPatientProgramRoundStepAction(initialPatientProgramRoundActionState, skipForm({ reasonCode: "OTHER", note: " " })),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedSkip).not.toHaveBeenCalled();

    await expect(
      skipPatientProgramRoundStepAction(initialPatientProgramRoundActionState, skipForm({ reasonCode: "PATIENT_DECLINED" })),
    ).resolves.toMatchObject({ status: "SUCCESS" });
    expect(mockedSkip).toHaveBeenCalledWith(actor, {
      patientProgramId: programId,
      roundNumber: 1,
      stepCode: "PAM",
      reasonCode: "PATIENT_DECLINED",
      note: null,
    });
  });

  it("shows the Thai sequencing message of a refused completion", async () => {
    mockedComplete.mockRejectedValueOnce(new RoundConflictError("ต้องจบบริการครั้งที่ 1 ก่อน จึงจะบันทึกครั้งที่ 2 ได้"));
    const formData = new FormData();
    formData.append("patientProgramId", programId);
    formData.append("roundNumber", "2");
    formData.append("submissionNonce", nonce);

    await expect(completePatientProgramRoundAction(initialPatientProgramRoundActionState, formData)).resolves.toEqual({
      status: "ERROR",
      code: "CONFLICT",
      message: "ต้องจบบริการครั้งที่ 1 ก่อน จึงจะบันทึกครั้งที่ 2 ได้",
    });
  });

  it("maps authorization and conflict failures to safe messages", async () => {
    mockedVitals.mockRejectedValueOnce(new ForbiddenError());
    await expect(
      recordPatientProgramRoundVitalsAction(initialPatientProgramRoundActionState, vitalsForm()),
    ).resolves.toMatchObject({ status: "ERROR", code: "FORBIDDEN" });

    mockedReview.mockRejectedValueOnce(new ConflictError("internal detail"));
    const conflict = await recordPatientProgramRoundReviewAction(initialPatientProgramRoundActionState, reviewForm());
    expect(conflict).toMatchObject({ status: "ERROR", code: "CONFLICT" });
    expect(JSON.stringify(conflict)).not.toContain("internal detail");

    mockedVitals.mockRejectedValueOnce(new Error("database exploded"));
    const unavailable = await recordPatientProgramRoundVitalsAction(
      initialPatientProgramRoundActionState,
      vitalsForm(),
    );
    expect(unavailable).toMatchObject({ status: "ERROR", code: "UNAVAILABLE" });
    expect(JSON.stringify(unavailable)).not.toContain("exploded");
  });
});
