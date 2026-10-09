import { drainAppointmentLineNotificationOutbox } from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import { verifyAndConsumeAppointmentLineNotificationInvocation } from "@/modules/appointments/services/appointment-line-notification-invocation-service";
import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (request.body !== null) {
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    await verifyAndConsumeAppointmentLineNotificationInvocation({
      timestamp: request.headers.get("x-demi-worker-timestamp"),
      nonce: request.headers.get("x-demi-worker-nonce"),
      signature: request.headers.get("x-demi-worker-signature"),
    });
    const result = await drainAppointmentLineNotificationOutbox();
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return Response.json({ error: "คำขอนี้ถูกใช้แล้ว" }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (error instanceof ForbiddenError) {
      return Response.json({ error: "ไม่พบปลายทางนี้" }, { status: 404, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "บริการไม่พร้อมใช้งาน" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
