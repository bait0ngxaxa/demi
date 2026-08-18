import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { PATIENT_ARTIFACT_CREATE_CAPABILITY } from "@/modules/patient-evidence/policies/patient-evidence-policy";
import { createPatientEvidenceArtifact } from "@/modules/patient-evidence/services/patient-evidence-service";
import { resolvePatientEvidenceAccessContext } from "@/modules/patient-evidence/services/patient-evidence-access-service";
import { PatientEvidenceInputError } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import { PatientEvidenceStorageError } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import {
  PATIENT_EVIDENCE_MAX_MULTIPART_BYTES,
  parsePatientEvidenceMultipart,
  PatientEvidenceMultipartError,
} from "@/modules/patient-evidence/transport/patient-evidence-upload-parser";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_REQUEST_BYTES = PATIENT_EVIDENCE_MAX_MULTIPART_BYTES;

type UploadRouteParams = {
  params: Promise<{ relationshipId: string }>;
};

function jsonError(message: string, status: number, code: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function hasOversizedDeclaredContentLength(contentLength: string | null): boolean {
  if (!contentLength) {
    return false;
  }

  const normalized = contentLength.trim();

  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  const parsedContentLength = Number(normalized);

  return Number.isFinite(parsedContentLength) && parsedContentLength > MAX_MULTIPART_REQUEST_BYTES;
}

function inputErrorMessage(error: PatientEvidenceInputError): string {
  switch (error.reason) {
    case "CAPTION_TOO_LONG":
      return "คำอธิบายต้องไม่เกิน 500 ตัวอักษร";
    case "EMPTY_FILE":
      return "กรุณาเลือกรูปหลักฐานที่ไม่ว่างเปล่า";
    case "FILE_TOO_LARGE":
      return "รูปต้องมีขนาดไม่เกิน 5 MB";
    case "UNSUPPORTED_MEDIA_TYPE":
      return "รูปต้องเป็น JPEG, PNG หรือ WEBP เท่านั้น";
    case "MEDIA_TYPE_MISMATCH":
    case "INVALID_FILE_CONTENT":
      return "ไฟล์รูปไม่ถูกต้องหรือชนิดไฟล์ไม่ตรงกับเนื้อหาจริง";
    case "INVALID_REQUEST":
      return "ข้อมูลการอัปโหลดไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง";
  }
}

function mapUploadError(error: unknown): Response {
  if (error instanceof PatientEvidenceMultipartError) {
    if (error.reason === "REQUEST_TOO_LARGE" || error.reason === "FILE_TOO_LARGE") {
      return jsonError("รูปต้องมีขนาดไม่เกิน 5 MB", 413, "FILE_TOO_LARGE");
    }

    return jsonError("ข้อมูลการอัปโหลดไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง", 400, "INVALID_INPUT");
  }

  if (error instanceof UnauthenticatedError) {
    return jsonError("กรุณาเข้าสู่ระบบใหม่", 401, "UNAUTHENTICATED");
  }

  if (error instanceof NotFoundError) {
    return jsonError("ไม่พบผู้ป่วยหรือหลักฐานในขอบเขตที่เข้าถึงได้", 404, "NOT_FOUND");
  }

  if (error instanceof ForbiddenError) {
    return jsonError("บัญชีนี้ไม่มีสิทธิ์บันทึกหลักฐานในขอบเขตนี้", 403, "FORBIDDEN");
  }

  if (error instanceof PatientEvidenceInputError) {
    return jsonError(inputErrorMessage(error), 400, "INVALID_INPUT");
  }

  if (error instanceof PatientEvidenceStorageError) {
    return jsonError("ระบบจัดเก็บรูปไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง", 503, "UPLOAD_UNAVAILABLE");
  }

  if (error instanceof ConflictError) {
    return jsonError("ไม่สามารถบันทึกหลักฐานนี้ได้ กรุณาลองใหม่อีกครั้ง", 409, "CONFLICT");
  }

  if (error instanceof InfrastructureError || error instanceof ValidationError) {
    return jsonError("บันทึกข้อมูลหลักฐานไม่สำเร็จ กรุณาลองใหม่ภายหลัง", 503, "PERSISTENCE_UNAVAILABLE");
  }

  if (error instanceof ApplicationError) {
    return jsonError("ไม่สามารถบันทึกหลักฐานได้ กรุณาลองใหม่อีกครั้ง", 400, error.code);
  }

  return jsonError("ไม่สามารถบันทึกหลักฐานได้ กรุณาลองใหม่ภายหลัง", 503, "UNAVAILABLE");
}

export async function POST(request: Request, { params }: UploadRouteParams): Promise<Response> {
  const contentLength = request.headers.get("content-length");

  if (hasOversizedDeclaredContentLength(contentLength)) {
    return jsonError("รูปต้องมีขนาดไม่เกิน 5 MB", 413, "FILE_TOO_LARGE");
  }

  try {
    const actor = await getProtectedApplicationActor();
    const { relationshipId } = await params;
    await resolvePatientEvidenceAccessContext(
      actor,
      relationshipId,
      PATIENT_ARTIFACT_CREATE_CAPABILITY,
    );

    const parsedMultipart = await parsePatientEvidenceMultipart(request);
    const result = await createPatientEvidenceArtifact(actor, {
      relationshipId,
      declaredMediaType: parsedMultipart.declaredMediaType,
      bytes: parsedMultipart.bytes,
      caption: parsedMultipart.caption,
    });

    revalidatePath(`/app/patients/${encodeURIComponent(result.patientHospitalRelationshipId)}/evidence`);
    revalidatePath(`/app/patients/${encodeURIComponent(result.patientHospitalRelationshipId)}`);

    return Response.json(
      {
        artifactId: result.artifactId,
        relationshipId: result.patientHospitalRelationshipId,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return mapUploadError(error);
  }
}

export const patientEvidenceUploadRouteInternals = {
  MAX_MULTIPART_REQUEST_BYTES,
  hasOversizedDeclaredContentLength,
  inputErrorMessage,
  mapUploadError,
};
