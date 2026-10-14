import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { PatientEvidenceMultipartError, parsePatientEvidenceMultipart } from "@/modules/patient-evidence/transport/patient-evidence-upload-parser";
import { PatientEvidenceInputError } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import { ApplicationError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { uploadHospitalContentImage } from "@/modules/hospital-content/services/hospital-content-image-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ contentId: string }> }): Promise<Response> {
  const noStore = { "cache-control": "no-store" };
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 8 * 1024 * 1024 + 128 * 1024)) {
    return Response.json({ error: "รูปมีขนาดใหญ่เกินกำหนด" }, { status: 413, headers: noStore });
  }
  try {
    const actor = await getProtectedApplicationActor();
    const parsed = await parsePatientEvidenceMultipart(request);
    if (!parsed.caption) return Response.json({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" }, { status: 400, headers: noStore });
    const { contentId } = await context.params;
    const result = await uploadHospitalContentImage(actor, { contentId, uploadNonce: parsed.caption, bytes: parsed.bytes, declaredMediaType: parsed.declaredMediaType });
    return Response.json(result, { status: result.replay ? 200 : 201, headers: noStore });
  } catch (error: unknown) {
    if (error instanceof PatientEvidenceMultipartError || error instanceof PatientEvidenceInputError || error instanceof ApplicationError && error.code === "VALIDATION") {
      return Response.json({ error: "รูปหรือข้อมูลอัปโหลดไม่ผ่านการตรวจสอบ" }, { status: 400, headers: noStore });
    }
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") {
      return Response.json({ error: "ไม่มีสิทธิ์จัดการเนื้อหานี้" }, { status: 403, headers: noStore });
    }
    if (error instanceof NotFoundError) return Response.json({ error: "ไม่พบเนื้อหานี้" }, { status: 404, headers: noStore });
    if (error instanceof ApplicationError && error.code === "CONFLICT") return Response.json({ error: "เนื้อหาหรือรูปเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่" }, { status: 409, headers: noStore });
    return Response.json({ error: "ระบบไม่พร้อมรับรูป กรุณาลองใหม่ภายหลัง" }, { status: 503, headers: noStore });
  }
}
