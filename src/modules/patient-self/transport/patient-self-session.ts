import "server-only";

import { isLineQuickActionLoginReturnTo } from "@/modules/auth/schemas/login-schema";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";

export const PATIENT_SELF_SESSION_EXPIRED_MESSAGE = "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";

export function getPatientSelfLoginHref(fixedEntryPath: unknown): string {
  return isLineQuickActionLoginReturnTo(fixedEntryPath) ? buildLoginReturnHref(fixedEntryPath) : "/login";
}
