import { lineReachabilityRequestSchema } from "@/modules/line/schemas/line-schemas";
import { refreshLineAccountReachabilityIfStale } from "@/modules/line/services/line-account-service";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Background friendship refresh from the Workspace LIFF entry. Ownership and LINE
 * identity come only from the DEMI session and the verified ID token; it never
 * reconciles the Rich Menu and returns only the refresh status.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineReachabilityRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const status = await refreshLineAccountReachabilityIfStale(parsed.data);
    if (status === "SIGNED_OUT") return Response.json({ error: "กรุณาเข้าสู่ระบบ DEMI ก่อน" }, { status: 401, headers: { "cache-control": "private, no-store" } });
    return Response.json({ status }, { headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
