import { NextResponse } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { recordParentChildHospitalReportingAudit } from "@/modules/reporting/services/parent-child-hospital-report-audit-service";
import { exportParentChildHospitalReportWorkbook } from "@/modules/reporting/services/parent-child-hospital-report-workbook-service";
import { safeReportFilenamePart } from "@/modules/reporting/transport/report-export-filename";
import {
  ApplicationError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
const QUERY_KEYS = ["parentHospitalId", "hospitalId"] as const;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนส่งออกรายงาน" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return NextResponse.json({ error: "ไม่พบรายงานหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งออกรายงานของโรงพยาบาลลูกข่ายนี้" }, { status: 403, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ error: "ระบบส่งออกรายงานไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" }, { status: 503, headers: NO_STORE_HEADERS });
}

/** ADR-0013 RPT-32 — "ดาวน์โหลดตามเขต": the nine-value summary of one exact active direct Child. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (
    QUERY_KEYS.some((key) => url.searchParams.getAll(key).length !== 1) ||
    [...url.searchParams.keys()].some((key) => !(QUERY_KEYS as readonly string[]).includes(key))
  ) {
    try {
      await recordParentChildHospitalReportingAudit({ operation: "export", outcome: "denied", reason: "SCOPE_UNAVAILABLE" });
    } catch {
      return errorResponse(null);
    }
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const actor = await getProtectedApplicationActor();
    const { buffer, generatedAt, summary } = await exportParentChildHospitalReportWorkbook(actor, {
      parentHospitalId: url.searchParams.get("parentHospitalId"),
      hospitalId: url.searchParams.get("hospitalId"),
    });
    const filename = `demi-child-summary-${safeReportFilenamePart(summary.hospital.id)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Content-Type": XLSX_CONTENT_TYPE,
        "X-Report-Generated-At": generatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
