import "server-only";

import type { Prisma } from "@prisma/client";
import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";

/** Revoking an issuer-visible token cannot undo an ambiguous global provider password change. */
export const unreconciledWorkforceResetWhere = {
  purpose: "RESET", claimedAt: { not: null }, usedAt: null,
} as const satisfies Prisma.WorkforceActivationWhereInput;

export const unreconciledAccountRecoveryWhere = {
  claimedAt: { not: null }, completedAt: null,
} as const satisfies Prisma.AccountRecoveryWhereInput;

export const unreconciledLinePasswordRecoveryWhere = {
  claimedAt: { not: null }, completedAt: null,
} as const satisfies Prisma.LinePasswordRecoveryCapabilityWhereInput;

/** A provider password change is outside the database transaction; keep recovery fenced until it settles. */
export async function assertPasswordChangeRecoveryAvailable(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: { passwordChangeOperationId: true },
  });
  if (!user || user.passwordChangeOperationId) {
    throw new ConflictError("The account credential operation requires reconciliation");
  }
}

export function assertIndependentCredentialRecoverySupported(): never {
  throw new ForbiddenError("การกู้คืนรหัสผ่านยังไม่เปิดใช้งาน เนื่องจากยังไม่มีวิธียืนยันเจ้าของบัญชีที่เป็นอิสระจากผู้ดูแล กรุณาติดต่อผู้ดูแลระบบเพื่อรับแนวทางดำเนินการ");
}
