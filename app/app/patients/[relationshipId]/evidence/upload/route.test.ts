import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientEvidenceStorageError } from "@/modules/patient-evidence/storage/patient-evidence-storage";

const {
  mockedCreateArtifact,
  mockedGetProtectedApplicationActor,
  mockedRevalidatePath,
} = vi.hoisted(() => ({
  mockedCreateArtifact: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedRevalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-service", () => ({
  createPatientEvidenceArtifact: mockedCreateArtifact,
}));

import { POST } from "./route";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };

function params(): { params: Promise<{ relationshipId: string }> } {
  return { params: Promise.resolve({ relationshipId }) };
}

function requestWithFormData(formData: FormData, headers?: HeadersInit): Request {
  return new Request("http://localhost/app/patients/test/evidence/upload", {
    body: formData,
    headers,
    method: "POST",
  });
}

describe("Patient Evidence upload Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedCreateArtifact.mockResolvedValue({
      artifactId,
      patientHospitalRelationshipId: relationshipId,
      mediaType: "image/jpeg",
      byteSize: 3,
      createdAt: new Date("2026-08-17T06:00:00.000Z"),
    });
  });

  it("accepts multipart input and returns only bounded identifiers", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "sensitive-name.jpg", {
      type: "image/jpeg",
    }));
    formData.append("caption", "คำอธิบาย");

    const response = await POST(requestWithFormData(formData), params());
    const body = (await response.json()) as { artifactId: string; relationshipId: string };

    expect(response.status).toBe(201);
    expect(body).toEqual({ artifactId, relationshipId });
    expect(mockedCreateArtifact).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        relationshipId,
        declaredMediaType: "image/jpeg",
        caption: "คำอธิบาย",
      }),
    );
    expect(mockedCreateArtifact.mock.calls[0]?.[1]).not.toHaveProperty("fileName");
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2);
  });

  it("rejects caller-controlled fields before reaching the application service", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
      type: "image/jpeg",
    }));
    formData.append("ownerType", "PatientHospitalRelationship");

    const response = await POST(requestWithFormData(formData), params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects oversized multipart requests before authentication and parsing", async () => {
    const response = await POST(
      new Request("http://localhost/app/patients/test/evidence/upload", {
        headers: { "content-length": String(6 * 1024 * 1024) },
        method: "POST",
      }),
      params(),
    );

    expect(response.status).toBe(413);
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("maps storage failures to a safe Thai response", async () => {
    mockedCreateArtifact.mockRejectedValue(new PatientEvidenceStorageError("upload"));
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
      type: "image/jpeg",
    }));

    const response = await POST(requestWithFormData(formData), params());
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toContain("ระบบจัดเก็บรูป");
    expect(body.error.message).not.toContain("signed");
  });
});
