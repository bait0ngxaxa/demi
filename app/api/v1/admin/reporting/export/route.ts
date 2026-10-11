import { NextResponse } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { exportGlobalAdminHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";
import { GLOBAL_REPORTING_CAPABILITIES } from "@/modules/reporting/policies/global-reporting-policy";
import { hospitalReportExportRequestSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
} from "@/modules/reporting/services/global-reporting-access-service";
import {
  ApplicationError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

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
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งออกรายงานของโรงพยาบาลนี้" }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApplicationError && error.code === "VALIDATION") {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ error: "ระบบส่งออกรายงานไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" }, { status: 503, headers: NO_STORE_HEADERS });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "hospital";
}

async function recordDeniedAttempt(
  actor: ActorContext | undefined,
  hospitalId: string | undefined,
  error: unknown,
): Promise<void> {
  await recordGlobalReportingAudit({
    actorUserId: actor?.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.export,
    ...(hospitalId ? { hospitalId } : {}),
    outcome: "denied",
    reason: globalReportingAuditReasonForError(error),
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const queryEntries = [...url.searchParams.entries()];
  if (
    queryEntries.length !== 1 ||
    queryEntries[0]?.[0] !== "hospitalId" ||
    url.searchParams.getAll("hospitalId").length !== 1
  ) {
    const error = new ApplicationError("VALIDATION", "Invalid export request");
    await recordDeniedAttempt(undefined, undefined, error);
    return errorResponse(error);
  }

  const parsed = hospitalReportExportRequestSchema.safeParse({
    hospitalId: url.searchParams.get("hospitalId"),
  });
  if (!parsed.success) {
    const error = new ApplicationError("VALIDATION", "Invalid export request");
    await recordDeniedAttempt(undefined, undefined, error);
    return errorResponse(error);
  }

  let actor: ActorContext | undefined;
  let exportServiceStarted = false;
  try {
    actor = await getProtectedApplicationActor();
    exportServiceStarted = true;
    const exported = await exportGlobalAdminHospitalReportingWorkbook(actor, parsed.data);
    const filename = `demi-hospital-report-${safeFilenamePart(exported.hospitalCode)}-${exported.generatedAt.toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(exported.buffer.byteLength),
        "Content-Type": XLSX_CONTENT_TYPE,
        "X-Report-Generated-At": exported.generatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (!exportServiceStarted) await recordDeniedAttempt(actor, parsed.data.hospitalId, error);
    return errorResponse(error);
  }
}
