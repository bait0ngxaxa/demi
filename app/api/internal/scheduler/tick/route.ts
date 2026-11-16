import { isAuthorizedNotificationSchedulerRequest } from "@/modules/notification-scheduler/services/notification-scheduler-auth";
import { runNotificationSchedulerTick } from "@/modules/notification-scheduler/services/notification-scheduler-tick-service";
import { reportUnexpectedError } from "@/shared/errors/unexpected-error-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedNotificationSchedulerRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "ไม่พบปลายทางนี้" }, { status: 404, headers: NO_STORE });
  }
  try {
    return Response.json(await runNotificationSchedulerTick(), { headers: NO_STORE });
  } catch (error: unknown) {
    // A tick failure is already reported under its tick scope; each error object is reported once.
    reportUnexpectedError("api.internal.scheduler.tick", error);
    return Response.json({ error: "บริการไม่พร้อมใช้งาน" }, { status: 503, headers: NO_STORE });
  }
}
