import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type Prisma } from "@prisma/client";

import type { ActorContext, ActorHospitalMembership } from "@/modules/auth/types/actor-context";

/**
 * ADR-0026 (MEMBER operational parity): the only definition of who operates a Hospital and who administers it.
 *
 * - Operator: an ACTIVE OWNER or MEMBER. Reports and exports, service-request confirm/reject, OSM assignment, network
 *   Patient read, Patient name correction and every care capability.
 * - Administrator: an ACTIVE OWNER only. Hospital management and user management.
 *
 * Both always require an ACTIVE membership, an ACTIVE User holding the HOSPITAL role and an ACTIVE Hospital. The SQL
 * predicates are the authority; the ActorContext helpers are the matching context check that runs before any read.
 */
export const HOSPITAL_OPERATOR_MEMBERSHIP_TYPES: readonly MembershipType[] = [MembershipType.OWNER, MembershipType.MEMBER];
export const HOSPITAL_ADMINISTRATOR_MEMBERSHIP_TYPES: readonly MembershipType[] = [MembershipType.OWNER];

export type HospitalAccessBasis = "OWNER" | "MEMBER";

function activeMembershipWhere(
  userId: string,
  hospitalId: string | undefined,
  membershipTypes: readonly MembershipType[],
): Prisma.HospitalMembershipWhereInput {
  return {
    userId,
    ...(hospitalId === undefined ? {} : { hospitalId }),
    membershipType: { in: [...membershipTypes] },
    status: MembershipStatus.ACTIVE,
    user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
    hospital: { is: { status: HospitalStatus.ACTIVE } },
  };
}

/** ACTIVE OWNER or MEMBER of the exact ACTIVE Hospital (every Hospital when `hospitalId` is omitted). */
export function hospitalOperatorMembershipWhere(userId: string, hospitalId?: string): Prisma.HospitalMembershipWhereInput {
  return activeMembershipWhere(userId, hospitalId, HOSPITAL_OPERATOR_MEMBERSHIP_TYPES);
}

/** ACTIVE OWNER of the exact ACTIVE Hospital (every Hospital when `hospitalId` is omitted). */
export function hospitalAdministratorMembershipWhere(userId: string, hospitalId?: string): Prisma.HospitalMembershipWhereInput {
  return activeMembershipWhere(userId, hospitalId, HOSPITAL_ADMINISTRATOR_MEMBERSHIP_TYPES);
}

/** Hospitals the actor operates; for `Hospital` relation filters. */
export function hospitalOperatedByWhere(userId: string): Prisma.HospitalWhereInput {
  return { status: HospitalStatus.ACTIVE, memberships: { some: hospitalOperatorMembershipWhere(userId) } };
}

/** Hospitals the actor administers; for `Hospital` relation filters. */
export function hospitalAdministeredByWhere(userId: string): Prisma.HospitalWhereInput {
  return { status: HospitalStatus.ACTIVE, memberships: { some: hospitalAdministratorMembershipWhere(userId) } };
}

export function accessBasisForMembershipType(membershipType: MembershipType): HospitalAccessBasis | null {
  if (membershipType === MembershipType.OWNER) return "OWNER";
  if (membershipType === MembershipType.MEMBER) return "MEMBER";
  return null;
}

function findActiveMembership(
  actor: ActorContext | null | undefined,
  hospitalId: string,
  membershipTypes: readonly MembershipType[],
): ActorHospitalMembership | undefined {
  if (!actor?.roles.includes(Role.HOSPITAL)) return undefined;
  const requested = hospitalId.toLowerCase();
  return actor.hospitalMemberships.find((membership) =>
    membership.hospitalId.toLowerCase() === requested &&
    membershipTypes.includes(membership.membershipType) &&
    membership.status === MembershipStatus.ACTIVE &&
    membership.hospitalStatus === HospitalStatus.ACTIVE);
}

/** Context check: the session claims an ACTIVE OWNER or MEMBER membership of the ACTIVE Hospital. */
export function findActiveHospitalOperatorMembership(
  actor: ActorContext | null | undefined,
  hospitalId: string,
): ActorHospitalMembership | undefined {
  return findActiveMembership(actor, hospitalId, HOSPITAL_OPERATOR_MEMBERSHIP_TYPES);
}

export function isActiveHospitalOperator(actor: ActorContext | null | undefined, hospitalId: string): boolean {
  return findActiveHospitalOperatorMembership(actor, hospitalId) !== undefined;
}

/** Context check: the session claims an ACTIVE OWNER membership of the ACTIVE Hospital. */
export function isActiveHospitalAdministrator(actor: ActorContext | null | undefined, hospitalId: string): boolean {
  return findActiveMembership(actor, hospitalId, HOSPITAL_ADMINISTRATOR_MEMBERSHIP_TYPES) !== undefined;
}
