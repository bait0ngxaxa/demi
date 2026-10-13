import "server-only";

import {
  ApplicationError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type { PatientImportDownload } from "./patient-import-downloads";
import { PatientImportPreviewBindingError } from "./patient-import-file-binding";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export function patientImportDownloadResponse(download: PatientImportDownload): Response {
  return new Response(new Uint8Array(download.buffer), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Disposition": `attachment; filename="${download.filename}"`,
      "Content-Length": String(download.buffer.byteLength),
      "Content-Type": XLSX_CONTENT_TYPE,
    },
  });
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export function patientImportDownloadErrorResponse(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return jsonError("กรุณาเข้าสู่ระบบใหม่", 401);
  }

  if (error instanceof PatientImportPreviewBindingError) {
    return jsonError("ไฟล์หรือผลตรวจสอบเปลี่ยนแปลงแล้ว กรุณาตรวจสอบไฟล์ใหม่อีกครั้ง", 400);
  }

  if (error instanceof ApplicationError) {
    // Only the Hospital the actor selected is ever named; no workbook on failure.
    if (error.code === "FORBIDDEN") {
      return jsonError("บัญชีนี้ไม่มีสิทธิ์นำเข้าผู้ป่วยในโรงพยาบาลนี้", 403);
    }

    if (error.code === "VALIDATION") {
      return jsonError(error.message, 400);
    }
  }

  return jsonError("ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง", 503);
}
