import { ensureServerEntryExports } from "next/dist/build/webpack/loaders/next-flight-loader/action-validate";
import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/shared/errors/application-error";

const mockedAssociateArtifact = vi.hoisted(() => vi.fn());
const mockedGetProtectedApplicationActor = vi.hoisted(() => vi.fn());
const mockedRecordConfidence = vi.hoisted(() => vi.fn());
const mockedRecordDreamCard = vi.hoisted(() => vi.fn());
const mockedRecordFloatingChart = vi.hoisted(() => vi.fn());
const mockedRecordRoutine = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockedRevalidatePath,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock("../services/patient-program-service-one-service", () => ({
  associatePatientProgramServiceOneArtifact: mockedAssociateArtifact,
  recordPatientProgramServiceOneConfidence: mockedRecordConfidence,
  recordPatientProgramServiceOneDreamCard: mockedRecordDreamCard,
  recordPatientProgramServiceOneFloatingChart: mockedRecordFloatingChart,
  recordPatientProgramServiceOneRoutine: mockedRecordRoutine,
}));

import * as patientProgramServiceOneServerActions from "./patient-program-service-one-server-actions";
import { associatePatientProgramServiceOneArtifactAction } from "./patient-program-service-one-server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "44444444-4444-4444-8444-444444444444" };
const associatedAt = new Date("2026-08-21T05:00:00.000Z");

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("patientProgramId", programId);
  formData.set("activity", "ROUTINE");
  formData.set("patientEvidenceArtifactId", artifactId);
  return formData;
}

describe("Patient Program Service 1 evidence server actions", () => {
  it("exports only values accepted by the Next.js Server Action runtime", () => {
    expect(() => ensureServerEntryExports(Object.values(patientProgramServiceOneServerActions))).not.toThrow();
  });

  it("rejects unexpected authority fields before authentication or persistence", async () => {
    const formData = validFormData();
    formData.set("patientHospitalRelationshipId", relationshipId);

    await expect(associatePatientProgramServiceOneArtifactAction(formData)).resolves.toMatchObject({
      status: "ERROR",
      code: "INVALID_INPUT",
    });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedAssociateArtifact).not.toHaveBeenCalled();
  });

  it("derives the actor server-side, associates the artifact, and revalidates scoped paths", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedAssociateArtifact.mockResolvedValue({
      activity: "ROUTINE",
      operation: "ASSOCIATED",
      associationId: "55555555-5555-4555-8555-555555555555",
      artifactId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "66666666-6666-4666-8666-666666666666",
      associatedAt,
    });

    await expect(associatePatientProgramServiceOneArtifactAction(validFormData())).resolves.toMatchObject({
      status: "SUCCESS",
      result: {
        activity: "ROUTINE",
        operation: "ASSOCIATED",
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        artifactId,
        associatedAt: associatedAt.toISOString(),
      },
    });
    expect(mockedAssociateArtifact).toHaveBeenCalledWith(actor, {
      patientProgramId: programId,
      patientEvidenceArtifactId: artifactId,
      activity: "ROUTINE",
    });
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(1, `/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(2, `/app/patients/${relationshipId}/programs`);
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(
      3,
      `/app/patients/${relationshipId}/programs/${programId}`,
    );
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(4, `/app/patients/${relationshipId}/evidence`);
  });

  it("maps a duplicate association to a safe conflict state", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedAssociateArtifact.mockRejectedValueOnce(new ConflictError("internal conflict"));

    await expect(associatePatientProgramServiceOneArtifactAction(validFormData())).resolves.toMatchObject({
      status: "ERROR",
      code: "CONFLICT",
    });
  });
});
