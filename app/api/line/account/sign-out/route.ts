import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { lineErrorResponse, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

/**
 * Ends only the DEMI session as the final step of LINE Disconnection. It never
 * touches LINE bindings or provider permissions, so a retry after a committed
 * unlink cannot unlink or deauthorize twice. Already signed out is success.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
  try {
    await signOutCurrentSession();
  } catch {
    return Response.json({ error: "ยังออกจากระบบ DEMI ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503, headers: noStore });
  }
  return Response.json({ status: "SIGNED_OUT", redirectTo: buildLoginReturnHref("/line/account") }, { headers: noStore });
}
