import { NextResponse } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";
import { hospitalReportExportRequestSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const queryKeys = [...url.searchParams.keys()];
  if (
    url.searchParams.getAll("hospitalId").length !== 1 ||
    url.searchParams.getAll("cohort").length > 1 ||
    queryKeys.some((key) => key !== "hospitalId" && key !== "cohort")
  ) {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  // Phase F: optional cohort=INCLUDE_ENDED ("รวมผู้ที่สิ้นสุดการดูแล"); omitted means the ACTIVE cohort.
  const cohort = url.searchParams.get("cohort");
  const parsed = hospitalReportExportRequestSchema.safeParse({
    hospitalId: url.searchParams.get("hospitalId"),
    ...(cohort === null ? {} : { cohort }),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const actor = await getProtectedApplicationActor();
    const { buffer, generatedAt } = await exportHospitalReportingWorkbook(actor, parsed.data);
    const filename = `demi-hospital-report-${safeFilenamePart(parsed.data.hospitalId)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
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
