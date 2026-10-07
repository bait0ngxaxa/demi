import "server-only";

import { getLineLoginEnv } from "@/lib/env/server";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { LineFailure, type LineFailureCode } from "../domain/line-errors";

const MAX_ACCOUNT_REQUEST_BYTES = 32 * 1024;

export async function requireSameOrigin(request: Request): Promise<void> {
  const expected = getLineLoginEnv().DEMI_LINE_PUBLIC_ORIGIN;
  if (request.headers.get("origin") !== expected) throw new ForbiddenError();
}

export async function readAccountJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ACCOUNT_REQUEST_BYTES) {
    throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
  }
  if (!request.body) throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACCOUNT_REQUEST_BYTES) {
        await reader.cancel();
        throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
  }
}

const messages: Record<LineFailureCode, string> = {
  INVALID_LINE_IDENTITY: "ไม่สามารถยืนยันบัญชี LINE นี้ได้ กรุณาลองใหม่",
  LINE_TOKEN_INVALID_OR_EXPIRED: "การยืนยัน LINE หมดอายุแล้ว กรุณาลองใหม่",
  LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED: "รายการนี้หมดอายุแล้ว กรุณาเริ่มใหม่",
  DEMI_ACCOUNT_INELIGIBLE: "บัญชี DEMI นี้ยังไม่พร้อมใช้งาน",
  LINE_BINDING_CONFLICT: "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ กรุณาตรวจสอบบัญชีและลองใหม่",
  UNLINK_UNAUTHORIZED: "ไม่สามารถยกเลิกการเชื่อมต่อนี้ได้",
  FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE: "ยังตรวจสอบการเพิ่ม DEMI เป็นเพื่อนไม่ได้",
  LINE_PROVIDER_TRANSIENT: "บริการ LINE ยังไม่พร้อม กรุณาลองใหม่ภายหลัง",
  LINE_PROVIDER_PERMANENT: "ไม่สามารถปรับปรุงเมนู LINE ได้ กรุณาติดต่อผู้ดูแล",
  RICH_MENU_MISMATCH: "เมนู LINE ยังปรับปรุงไม่สำเร็จ",
  LINE_CONFIGURATION_MISSING: "บริการ LINE ยังไม่ได้ตั้งค่า",
  LINE_RATE_LIMITED: "คุณเริ่มทำรายการหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
};

export function lineErrorResponse(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return Response.json({ error: "กรุณาเข้าสู่ระบบ DEMI ก่อน" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: "ไม่สามารถดำเนินการนี้ได้" }, { status: 403 });
  }
  if (error instanceof LineFailure) {
    const status = error.code === "LINE_RATE_LIMITED" ? 429
      : error.code === "LINE_BINDING_CONFLICT" ? 409
      : error.code === "DEMI_ACCOUNT_INELIGIBLE" || error.code === "UNLINK_UNAUTHORIZED" ? 403
      : error.code === "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" || error.code === "LINE_TOKEN_INVALID_OR_EXPIRED" ? 400
      : 503;
    return Response.json({ error: messages[error.code] }, { status });
  }
  return Response.json({ error: "ระบบไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503 });
}

export const lineAccountHttpInternals = { MAX_ACCOUNT_REQUEST_BYTES };
