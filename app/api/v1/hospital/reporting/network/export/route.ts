import { NextResponse } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { parseNetworkReportExportQuery } from "@/modules/reporting/schemas/hospital-report-schemas";
import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";
import { recordNetworkReportExportRefusal } from "@/modules/reporting/services/network-report-audit-service";
import { exportNetworkReportWorkbook } from "@/modules/reporting/services/network-report-export-service";
import { safeReportFilenamePart } from "@/modules/reporting/transport/report-export-filename";
import {
  ApplicationError,
  ForbiddenError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
const INVALID_REQUEST_MESSAGE = "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนส่งออกรายงาน" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  if (error instanceof HospitalReportExportLimitError) {
    return NextResponse.json({ error: error.message }, { status: 413, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return NextResponse.json({ error: "ไม่พบรายงานหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งออกรายงานเครือข่ายนี้" }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    // The message names the Hospitals no longer in the exportable network; it carries no Patient data.
    return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "VALIDATION") {
    return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ error: "ระบบส่งออกรายงานไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" }, { status: 503, headers: NO_STORE_HEADERS });
}

/** ADR-0025 — one workbook for the Parent and all (`scope=ALL`) or selected (`hospitalId`, repeatable) network Hospitals. */
export async function GET(request: Request): Promise<Response> {
  let actor: ActorContext;
  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    // No audit for an unauthenticated request; a verified session denied application access is recorded actorless.
    if (error instanceof ForbiddenError) {
      try {
        await recordNetworkReportExportRefusal({ outcome: "denied", reason: "NOT_AUTHORIZED" });
      } catch {
        return errorResponse(null);
      }
    }
    return errorResponse(error);
  }

  const query = parseNetworkReportExportQuery(new URL(request.url).searchParams);
  if (!query) {
    try {
      await recordNetworkReportExportRefusal({ actor, outcome: "denied", reason: "INVALID_REQUEST" });
    } catch {
      return errorResponse(null);
    }
    return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const { buffer, generatedAt, parent } = await exportNetworkReportWorkbook(actor, query);
    const filename = `demi-network-report-${safeReportFilenamePart(parent.hospitalCode)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
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
