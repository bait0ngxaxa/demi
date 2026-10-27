import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type Prisma } from "@prisma/client";
import { ConflictError } from "@/shared/errors/application-error";

export type WorkforceCategory = "HOSPITAL" | "OSM";

export const WORKFORCE_COMPATIBILITY_UNAVAILABLE_MESSAGE =
  "ไม่สามารถเพิ่มบุคคลนี้ได้ เนื่องจากข้อมูลหรือสถานะบัญชีไม่เข้าเงื่อนไข กรุณาตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ";

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
  disclosure?: { actorUserId: string; hospitalId: string },
): Promise<void> {
  const [membership, osm] = await Promise.all([
    transaction.hospitalMembership.findFirst({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { status: true } }),
    transaction.osmHospitalRelationship.findFirst({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { status: true } }),
  ]);
  if ((category === "OSM" && membership) || (category === "HOSPITAL" && osm) ||
    hasConflictingWorkforceRelationships(membership ? [membership] : [], osm ? [osm] : [])) {
    if (category && disclosure) {
      // Disclosure requires both current persisted OWNER authority and an opposite-category relationship in that scope.
      // The global conflict above remains authoritative even if this scoped read finds nothing.
      const [owner, localConflict] = await Promise.all([
        transaction.hospitalMembership.findFirst({
          where: {
            userId: disclosure.actorUserId, hospitalId: disclosure.hospitalId,
            membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
            user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } },
          },
          select: { id: true },
        }),
        category === "OSM"
          ? transaction.hospitalMembership.findFirst({ where: { userId, hospitalId: disclosure.hospitalId, status: { not: MembershipStatus.ENDED } }, select: { id: true } })
          : transaction.osmHospitalRelationship.findFirst({ where: { userId, hospitalId: disclosure.hospitalId, status: { not: MembershipStatus.ENDED } }, select: { id: true } }),
      ]);
      if (owner && localConflict) throw new WorkforceRelationshipConflictError(category);
    }
    throw new ConflictError(WORKFORCE_COMPATIBILITY_UNAVAILABLE_MESSAGE);
  }
}
