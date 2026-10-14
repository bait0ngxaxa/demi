import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getHospitalContentImageSignedUrl } from "@/modules/hospital-content/services/hospital-content-image-service";
import { ApplicationError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  try {
    const actor = await getProtectedApplicationActor();
    const { imageId } = await context.params;
    const signedUrl = await getHospitalContentImageSignedUrl(actor, imageId);
    return new Response(null, { status: 302, headers: { ...headers, location: signedUrl } });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") {
      return Response.json({ error: "ไม่มีสิทธิ์ดูรูปนี้" }, { status: 403, headers });
    }
    if (error instanceof NotFoundError) return Response.json({ error: "ไม่พบรูปนี้" }, { status: 404, headers });
    return Response.json({ error: "ไม่สามารถโหลดรูปได้" }, { status: 503, headers });
  }
}
