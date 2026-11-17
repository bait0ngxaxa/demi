import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

const { mockedGetActor, mockedRemove } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedRemove: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetActor,
}));
vi.mock("../services/patient-evidence-service", () => ({
  removePatientEvidenceArtifact: mockedRemove,
}));

import { removePatientEvidenceArtifactAction } from "./patient-evidence-server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };

function formWith(reason: string | null): FormData {
  const formData = new FormData();
  if (reason !== null) formData.set("reason", reason);
  return formData;
}

describe("Patient Evidence removal server action (N4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedRemove.mockResolvedValue({ artifactId });
  });

  it("passes the reason to the service and reports success", async () => {
    const result = await removePatientEvidenceArtifactAction(relationshipId, artifactId, { status: "IDLE", message: "" }, formWith("ผิดคน"));

    expect(result).toEqual({ status: "SUCCESS", message: "ลบรูปหลักฐานแล้ว" });
    expect(mockedRemove).toHaveBeenCalledWith(actor, { artifactId, relationshipId, reason: "ผิดคน" });
  });

  it("sends an empty reason when the field is missing, so the service rejects it", async () => {
    await removePatientEvidenceArtifactAction(relationshipId, artifactId, { status: "IDLE", message: "" }, formWith(null));

    expect(mockedRemove).toHaveBeenCalledWith(actor, { artifactId, relationshipId, reason: "" });
  });

  it.each([
    [new ValidationError("bad"), "INVALID_INPUT"],
    [new ConflictError("รูปหลักฐานนี้ถูกลบไปแล้ว"), "CONFLICT"],
    [new NotFoundError(), "NOT_FOUND"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new UnauthenticatedError(), "UNAUTHENTICATED"],
    [new InfrastructureError("down"), "UNAVAILABLE"],
    [new Error("unexpected"), "UNAVAILABLE"],
  ])("classifies %s as %s", async (error, code) => {
    mockedRemove.mockRejectedValueOnce(error);

    const result = await removePatientEvidenceArtifactAction(relationshipId, artifactId, { status: "IDLE", message: "" }, formWith("ผิดคน"));

    expect(result).toMatchObject({ status: "ERROR", code });
  });

  it("shows the service's Thai conflict message", async () => {
    mockedRemove.mockRejectedValueOnce(new ConflictError("รูปหลักฐานนี้ถูกลบไปแล้ว"));

    const result = await removePatientEvidenceArtifactAction(relationshipId, artifactId, { status: "IDLE", message: "" }, formWith("ผิดคน"));

    expect(result).toMatchObject({ message: "รูปหลักฐานนี้ถูกลบไปแล้ว" });
  });
});
