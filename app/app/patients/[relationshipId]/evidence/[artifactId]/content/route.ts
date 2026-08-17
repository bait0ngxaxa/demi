import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPatientEvidenceArtifactAccess } from "@/modules/patient-evidence/services/patient-evidence-query-service";
import { PatientEvidenceStorageError } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContentRouteParams = {
  params: Promise<{ relationshipId: string; artifactId: string }>;
};

function jsonError(message: string, status: number, code: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request, { params }: ContentRouteParams): Promise<Response> {
  void request;

  try {
    const actor = await getProtectedApplicationActor();
    const { relationshipId, artifactId } = await params;
    const access = await getPatientEvidenceArtifactAccess(actor, relationshipId, artifactId);

    return Response.redirect(access.temporaryAccessUrl, 302);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      return jsonError("กรุณาเข้าสู่ระบบใหม่", 401, "UNAUTHENTICATED");
    }

    if (error instanceof NotFoundError) {
      return jsonError("ไม่พบหลักฐานในขอบเขตที่เข้าถึงได้", 404, "NOT_FOUND");
    }

    if (error instanceof ForbiddenError) {
      return jsonError("บัญชีนี้ไม่มีสิทธิ์ดูหลักฐานนี้", 403, "FORBIDDEN");
    }

    if (error instanceof PatientEvidenceStorageError || error instanceof InfrastructureError) {
      return jsonError("ไม่สามารถเปิดรูปหลักฐานได้ กรุณาลองใหม่ภายหลัง", 503, "UNAVAILABLE");
    }

    return jsonError("ไม่สามารถเปิดรูปหลักฐานได้ กรุณาลองใหม่ภายหลัง", 503, "UNAVAILABLE");
  }
}
