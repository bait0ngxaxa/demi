import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientEvidenceStorageError } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import { PATIENT_EVIDENCE_MAX_BYTES } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const {
  mockedCreateArtifact,
  mockedGetProtectedApplicationActor,
  mockedResolveAccess,
  mockedRevalidatePath,
} = vi.hoisted(() => ({
  mockedCreateArtifact: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedResolveAccess: vi.fn(),
  mockedRevalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-access-service", () => ({
  resolvePatientEvidenceAccessContext: mockedResolveAccess,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-service", () => ({
  createPatientEvidenceArtifact: mockedCreateArtifact,
}));

import { POST, patientEvidenceUploadRouteInternals } from "./route";

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

function createMultipartBody(input: {
  fileBytes: Uint8Array;
  mediaType: string;
  caption?: string;
  duplicateFileBytes?: Uint8Array;
}): { body: Uint8Array; contentType: string } {
  const boundary = "patient-evidence-test-boundary";
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const appendText = (value: string): void => {
    chunks.push(encoder.encode(value));
  };

  appendText(`--${boundary}\r\n`);
  appendText('Content-Disposition: form-data; name="file"; filename="ignored.jpg"\r\n');
  appendText(`Content-Type: ${input.mediaType}\r\n\r\n`);
  chunks.push(input.fileBytes);
  appendText("\r\n");

  if (input.caption !== undefined) {
    appendText(`--${boundary}\r\n`);
    appendText('Content-Disposition: form-data; name="caption"\r\n\r\n');
    appendText(input.caption);
    appendText("\r\n");
  }

  if (input.duplicateFileBytes) {
    appendText(`--${boundary}\r\n`);
    appendText('Content-Disposition: form-data; name="file"; filename="ignored-again.jpg"\r\n');
    appendText(`Content-Type: ${input.mediaType}\r\n\r\n`);
    chunks.push(input.duplicateFileBytes);
    appendText("\r\n");
  }

  appendText(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function requestWithStream(
  body: Uint8Array,
  contentType: string,
  options: { contentLength?: string; chunkSize?: number } = {},
): { request: Request; state: { pulls: number; cancelled: boolean; bodyAccessed: boolean } } {
  const state = { pulls: 0, cancelled: false, bodyAccessed: false };
  const chunkSize = options.chunkSize ?? 64 * 1024;
  let offset = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulls += 1;

      if (offset >= body.byteLength) {
        controller.close();
        return;
      }

      const nextOffset = Math.min(offset + chunkSize, body.byteLength);
      const chunk = body.subarray(offset, nextOffset);
      offset = nextOffset;
      controller.enqueue(chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  });

  const headers: HeadersInit = { "content-type": contentType };

  if (options.contentLength !== undefined) {
    headers["content-length"] = options.contentLength;
  }

  return {
    request: {
      headers: new Headers(headers),
      get body(): ReadableStream<Uint8Array> {
        state.bodyAccessed = true;
        return stream;
      },
    } as unknown as Request,
    state,
  };
}

describe("Patient Evidence upload Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedResolveAccess.mockResolvedValue({});
    mockedCreateArtifact.mockResolvedValue({
      artifactId,
      patientHospitalRelationshipId: relationshipId,
      mediaType: "image/jpeg",
      byteSize: 3,
      createdAt: new Date("2026-08-17T06:00:00.000Z"),
    });
  });

  it.each([
    ["JPEG", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])],
    [
      "PNG",
      "image/png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    [
      "WEBP",
      "image/webp",
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
    ],
  ])("accepts authorized %s multipart input and returns only bounded identifiers", async (
    _format,
    mediaType,
    fileBytes,
  ) => {
    const formData = new FormData();
    formData.append("file", new File([fileBytes], "sensitive-name.jpg", {
      type: mediaType,
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
        declaredMediaType: mediaType,
        caption: "คำอธิบาย",
      }),
    );
    expect(mockedCreateArtifact.mock.calls[0]?.[1]).not.toHaveProperty("fileName");
    expect(mockedResolveAccess).toHaveBeenCalledWith(
      actor,
      relationshipId,
      "patient-artifact:create",
    );
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

  it("rejects duplicate file parts", async () => {
    const multipart = createMultipartBody({
      fileBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: "image/jpeg",
      duplicateFileBytes: new Uint8Array([0xff, 0xd8, 0xff]),
    });
    const { request } = requestWithStream(multipart.body, multipart.contentType);

    const response = await POST(request, params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects duplicate caption parts", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
      type: "image/jpeg",
    }));
    formData.append("caption", "หนึ่ง");
    formData.append("caption", "สอง");

    const response = await POST(requestWithFormData(formData), params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects a request without a file", async () => {
    const formData = new FormData();
    formData.append("caption", "ไม่มีไฟล์");

    const response = await POST(requestWithFormData(formData), params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects captions longer than 500 characters before application creation", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
      type: "image/jpeg",
    }));
    formData.append("caption", "ก".repeat(501));

    const response = await POST(requestWithFormData(formData), params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects multiple file parts even when the request body is oversized", async () => {
    const multipart = createMultipartBody({
      fileBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: "image/jpeg",
      duplicateFileBytes: new Uint8Array(PATIENT_EVIDENCE_MAX_BYTES),
    });
    const { request } = requestWithStream(multipart.body, multipart.contentType);

    const response = await POST(request, params());

    expect(response.status).toBe(400);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["inaccessible relationship", new NotFoundError(), 404],
    ["forbidden capability", new ForbiddenError(), 403],
  ])("pre-authorizes before consuming the body for %s", async (_label, error, expectedStatus) => {
    mockedResolveAccess.mockRejectedValueOnce(error);
    const multipart = createMultipartBody({
      fileBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: "image/jpeg",
    });
    const { request, state } = requestWithStream(multipart.body, multipart.contentType);

    const response = await POST(request, params());

    expect(response.status).toBe(expectedStatus);
    expect(state.bodyAccessed).toBe(false);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects oversized multipart requests before authentication and parsing", async () => {
    const multipart = createMultipartBody({
      fileBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: "image/jpeg",
    });
    const { request, state } = requestWithStream(
      multipart.body,
      multipart.contentType,
      { contentLength: String(patientEvidenceUploadRouteInternals.MAX_MULTIPART_REQUEST_BYTES + 1) },
    );
    const response = await POST(
      request,
      params(),
    );

    expect(response.status).toBe(413);
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(state.bodyAccessed).toBe(false);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects an oversized actual body without Content-Length while streaming", async () => {
    const fileBytes = new Uint8Array(PATIENT_EVIDENCE_MAX_BYTES + 64 * 1024);
    fileBytes.set([0xff, 0xd8, 0xff]);
    const multipart = createMultipartBody({ fileBytes, mediaType: "image/jpeg" });
    const { request, state } = requestWithStream(multipart.body, multipart.contentType);

    const response = await POST(request, params());

    expect(response.status).toBe(413);
    expect(state.pulls).toBeGreaterThan(0);
    expect(state.bodyAccessed).toBe(true);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects a multipart request that crosses the total stream bound without Content-Length", async () => {
    const body = new Uint8Array(patientEvidenceUploadRouteInternals.MAX_MULTIPART_REQUEST_BYTES + 1);
    const { request, state } = requestWithStream(
      body,
      "multipart/form-data; boundary=patient-evidence-raw-limit",
      { chunkSize: body.byteLength },
    );

    const response = await POST(request, params());

    expect(response.status).toBe(413);
    expect(state.bodyAccessed).toBe(true);
    expect(mockedCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects an oversized actual body when Content-Length understates it", async () => {
    const fileBytes = new Uint8Array(PATIENT_EVIDENCE_MAX_BYTES + 64 * 1024);
    fileBytes.set([0xff, 0xd8, 0xff]);
    const multipart = createMultipartBody({ fileBytes, mediaType: "image/jpeg" });
    const { request } = requestWithStream(multipart.body, multipart.contentType, {
      contentLength: "1",
    });

    const response = await POST(request, params());

    expect(response.status).toBe(413);
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
