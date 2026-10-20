import { isAuthorizedNotificationSchedulerRequest } from "@/modules/notification-scheduler/services/notification-scheduler-auth";
import { getNotificationSchedulerReadiness } from "@/modules/notification-scheduler/services/notification-scheduler-readiness-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedNotificationSchedulerRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "ไม่พบปลายทางนี้" }, { status: 404, headers: NO_STORE });
  }
  try {
    const readiness = await getNotificationSchedulerReadiness();
    return Response.json(readiness, { status: readiness.healthy ? 200 : 503, headers: NO_STORE });
  } catch {
    return Response.json({ error: "บริการไม่พร้อมใช้งาน" }, { status: 503, headers: NO_STORE });
  }
}
