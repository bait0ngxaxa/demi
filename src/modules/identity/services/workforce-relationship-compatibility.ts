import "server-only";

import { MembershipStatus, type Prisma } from "@prisma/client";
import { ConflictError } from "@/shared/errors/application-error";

export type WorkforceCategory = "HOSPITAL" | "OSM";

export class WorkforceRelationshipConflictError extends ConflictError {
  constructor(category?: WorkforceCategory) {
    super(category === "OSM"
      ? "ไม่สามารถเพิ่มเป็น อสม. ได้ เนื่องจากบุคคลนี้มีสถานะเป็นบุคลากรโรงพยาบาลอยู่แล้ว"
      : category === "HOSPITAL"
        ? "ไม่สามารถเพิ่มเป็นบุคลากรโรงพยาบาลได้ เนื่องจากบุคคลนี้มีสถานะเป็น อสม. อยู่แล้ว"
        : "บัญชีนี้มีความสัมพันธ์บุคลากรโรงพยาบาลและ อสม. ที่ยังไม่สิ้นสุด กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบและกระทบยอดความสัมพันธ์ก่อนเปิดใช้งาน");
  }
}

/** ENDED is history. Suspended, pending and invited relationships still reserve the workforce category. */
export function hasConflictingWorkforceRelationships(
  memberships: readonly { status: MembershipStatus }[],
  osmRelationships: readonly { status: MembershipStatus }[],
): boolean {
  return memberships.some(({ status }) => status !== MembershipStatus.ENDED) &&
    osmRelationships.some(({ status }) => status !== MembershipStatus.ENDED);
}

/**
 * Call after canonical identity resolution, before grants, in the caller's SERIALIZABLE transaction.
 * Both category predicates participate in PostgreSQL serialization: concurrent opposite grants cannot both commit.
 * No Hospital, profession, account status or UserRole filter may narrow this relationship invariant.
 */
export async function assertWorkforceRelationshipsCompatible(
  transaction: Prisma.TransactionClient,
  userId: string,
  category?: WorkforceCategory,
): Promise<void> {
  const [membership, osm] = await Promise.all([
    transaction.hospitalMembership.findFirst({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { status: true } }),
    transaction.osmHospitalRelationship.findFirst({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { status: true } }),
  ]);
  if ((category === "OSM" && membership) || (category === "HOSPITAL" && osm) ||
    hasConflictingWorkforceRelationships(membership ? [membership] : [], osm ? [osm] : [])) {
    throw new WorkforceRelationshipConflictError(category);
  }
}
