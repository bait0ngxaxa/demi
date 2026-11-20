import { Role } from "@prisma/client";

/**
 * Owner decision 2026-11-19: a platform ADMIN does not use Family (menu, pages or caregiver acceptance), even when the
 * account also holds another role. Same precedent as `canSubmitSupportReport`. Navigation uses this as a hint; the
 * Family pages and every caregiver acceptance re-check it on the server.
 */
export function canUseFamilyWorkspace(roles: readonly Role[]): boolean {
  return !roles.includes(Role.ADMIN);
}

export const PLATFORM_ADMIN_CAREGIVER_INVITATION_MESSAGE = "บัญชีผู้ดูแลระบบ DEMI ใช้ตอบรับคำเชิญผู้ดูแลไม่ได้";
