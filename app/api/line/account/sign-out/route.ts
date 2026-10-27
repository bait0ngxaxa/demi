import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { lineIntentUseSchema } from "@/modules/line/schemas/line-schemas";
import { verifyLineUnlinkCompletion } from "@/modules/line/services/line-account-service";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";
import { UnauthenticatedError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };
const loginReturn = (): string => buildLoginReturnHref("/line/account");

const outcomes = {
  SESSION_CHANGED: "บัญชีที่เข้าสู่ระบบในเครื่องนี้เปลี่ยนไปแล้ว ระบบจึงไม่ออกจากระบบให้",
  NOT_COMMITTED: "ยังไม่พบผลการยกเลิกการเชื่อมต่อ LINE",
  PROOF_EXPIRED: "หลักฐานการยกเลิกครั้งนี้หมดอายุแล้ว ระบบจึงไม่ออกจากระบบให้อัตโนมัติ",
} as const;

/**
 * Final step of LINE Disconnection. Ends the DEMI session only when the
 * submitted UNLINK intent committed for this exact User and session, so a tab
 * that outlived its session can never sign out another principal. It never
 * touches LINE bindings or provider permissions; retries cannot unlink twice.
 * Only SIGNED_OUT is evidence that the UNLINK committed.
 */
export async function POST(request: Request): Promise<Response> {
  let completion: Awaited<ReturnType<typeof verifyLineUnlinkCompletion>>;
  try {
    await requireSameOrigin(request);
    const parsed = lineIntentUseSchema.strict().safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400, headers: noStore });
    completion = await verifyLineUnlinkCompletion(parsed.data);
  } catch (error: unknown) {
    // No session to end, and therefore no proof the UNLINK committed.
    if (error instanceof UnauthenticatedError) {
      return Response.json({ code: "SESSION_ABSENT", error: "กรุณาเข้าสู่ระบบ DEMI ก่อน", redirectTo: loginReturn() }, { status: 401, headers: noStore });
    }
    return lineErrorResponse(error);
  }
  if (completion !== "COMMITTED") {
    return Response.json({ code: completion, error: outcomes[completion] }, { status: 409, headers: noStore });
  }
  try {
    await signOutCurrentSession();
  } catch {
    return Response.json({ error: "ยังออกจากระบบ DEMI ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503, headers: noStore });
  }
  return Response.json({ status: "SIGNED_OUT", redirectTo: loginReturn() }, { headers: noStore });
}
