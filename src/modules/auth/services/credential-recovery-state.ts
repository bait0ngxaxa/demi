import "server-only";

import type { Prisma } from "@prisma/client";
import { ForbiddenError } from "@/shared/errors/application-error";

/** Revoking an issuer-visible token cannot undo an ambiguous global provider password change. */
export const unreconciledWorkforceResetWhere = {
  purpose: "RESET", claimedAt: { not: null }, usedAt: null,
} as const satisfies Prisma.WorkforceActivationWhereInput;

export const unreconciledAccountRecoveryWhere = {
  claimedAt: { not: null }, completedAt: null,
} as const satisfies Prisma.AccountRecoveryWhereInput;

export function assertIndependentCredentialRecoverySupported(): never {
  throw new ForbiddenError("การกู้คืนรหัสผ่านยังไม่เปิดใช้งาน เนื่องจากยังไม่มีวิธียืนยันเจ้าของบัญชีที่เป็นอิสระจากผู้ดูแล กรุณาติดต่อผู้ดูแลระบบเพื่อรับแนวทางดำเนินการ");
}
