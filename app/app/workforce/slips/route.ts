import QRCode from "qrcode";

import { getApplicationPublicOrigin } from "@/lib/env/server";

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

function htmlError(message: string, status: number, managementHref?: string): Response {
  return new Response(renderActivationSlipsError(message, managementHref), { status, headers: responseHeaders });
}

// Route handlers have no built-in CSRF protection, unlike server actions.
function isSameOriginRequest(request: Request, origin: string): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  return request.headers.get("origin") === origin && (!fetchSite || fetchSite === "same-origin");
}

async function readSlipForm(request: Request): Promise<FormData> {
  const limit = 32 * 1024;
  if (Number(request.headers.get("content-length")) > limit || !request.body) {
    throw new Error("Slip request exceeds its limit");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Slip request exceeds its limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), { headers: {
    "content-type": request.headers.get("content-type") ?? "",
  } }).formData();
}

export async function POST(request: Request): Promise<Response> {
  let origin: string;
  try {
    origin = getApplicationPublicOrigin();
  } catch {
    return htmlError("ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับใบเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ", 503);
  }
  if (!isSameOriginRequest(request, origin)) {
    return htmlError("คำขอไม่ถูกต้อง", 403);
  }

  let formData: FormData;

  try {
    formData = await readSlipForm(request);
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

    // Credential issuance may have committed before the printable response failed.
    return htmlError(
      "ระบบอาจออกลิงก์ใหม่แล้ว แต่แสดงใบไม่สำเร็จ ลิงก์ที่ออกแล้วแสดงซ้ำไม่ได้ กรุณาตรวจสอบสถานะก่อนออกลิงก์ใหม่อีกครั้ง",
      503,
      `/app/workforce?hospitalId=${encodeURIComponent(parsed.data.targetHospitalId)}#workforce-pending`,
    );
  }
}
