import QRCode from "qrcode";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { workforceActivationSlipRequestSchema } from "@/modules/workforce/schemas/workforce-schemas";
import { issueWorkforceActivationSlips } from "@/modules/workforce/services/workforce-service";
import {
  ACTIVATION_SLIPS_CONTENT_SECURITY_POLICY,
  renderActivationSlipsError,
  renderActivationSlipsPage,
} from "@/modules/workforce/transport/activation-slips-html";
import {
  ApplicationError,
  ForbiddenError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The response carries one-time activation credentials, so it must never be stored or indexed.
const responseHeaders = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": ACTIVATION_SLIPS_CONTENT_SECURITY_POLICY,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function htmlError(message: string, status: number): Response {
  return new Response(renderActivationSlipsError(message), { status, headers: responseHeaders });
}

// Route handlers have no built-in CSRF protection, unlike server actions.
function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite) {
    return fetchSite === "same-origin";
  }

  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return htmlError("คำขอไม่ถูกต้อง", 403);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return htmlError("ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
  }

  const parsed = workforceActivationSlipRequestSchema.safeParse({
    targetHospitalId: formData.get("targetHospitalId"),
    kind: formData.get("kind"),
    userIds: formData.getAll("userId"),
  });

  if (!parsed.success) {
    return htmlError("กรุณาเลือกบุคลากรที่ต้องการพิมพ์ใบเปิดใช้งาน (ไม่เกิน 50 คน)", 400);
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await issueWorkforceActivationSlips(actor, parsed.data);
    const origin = new URL(request.url).origin;
    const slips = await Promise.all(
      result.slips.map(async (slip) => ({
        maskedName: slip.maskedName,
        hospitalName: slip.hospitalName,
        expiresAt: slip.activationExpiresAt,
        qrDataUrl: await QRCode.toDataURL(
          `${origin}/activate/workforce#${encodeURIComponent(slip.activationToken)}`,
          { errorCorrectionLevel: "M", margin: 1, width: 300 },
        ),
      })),
    );

    return new Response(renderActivationSlipsPage({ slips, failures: result.failures }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      return htmlError("กรุณาเข้าสู่ระบบอีกครั้ง", 401);
    }

    if (error instanceof ForbiddenError) {
      return htmlError("บัญชีนี้ไม่มีสิทธิ์พิมพ์ใบเปิดใช้งานของโรงพยาบาลนี้", 403);
    }

    if (error instanceof ApplicationError && error.code === "VALIDATION") {
      return htmlError("ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
    }

    // A failure after issuing may have created credentials nobody saw; they simply expire.
    return htmlError("ระบบไม่พร้อมออกใบเปิดใช้งานในขณะนี้ กรุณาลองใหม่อีกครั้ง", 503);
  }
}
