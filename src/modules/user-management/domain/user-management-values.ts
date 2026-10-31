import {
  MembershipStatus,
  PatientActivationPurpose,
  Prisma,
  UserStatus,
  WorkforceActivationMode,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { z } from "zod";

/** UM-1: the three kinds of record an OWNER manages in one directory (URL segment values). */
export const userKindSchema = z.enum(["staff", "osm", "patient"]);
export type UserKind = z.infer<typeof userKindSchema>;

/** Directory status buckets: รอลงทะเบียน · ใช้งานอยู่ · ระงับ · นำออกแล้ว. */
export const userStatusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REMOVED"]);
export type UserDirectoryStatus = z.infer<typeof userStatusSchema>;

/** How the account was first activated; OTHER is shown but never filtered (e.g. bootstrap accounts). */
export const activationMethodFilterSchema = z.enum(["SELF_REGISTERED", "INVITE", "ASSISTED", "NOT_ACTIVATED"]);
export type ActivationMethodFilter = z.infer<typeof activationMethodFilterSchema>;
export type ActivationMethod = ActivationMethodFilter | "OTHER";

export const userRecordTargetSchema = z.object({ kind: userKindSchema, relationshipId: z.uuid() }).strict();
export type UserRecordTarget = z.infer<typeof userRecordTargetSchema>;

export const userDirectoryInputSchema = z.object({
  targetHospitalId: z.uuid(),
  kind: userKindSchema,
  status: userStatusSchema.optional(),
  method: activationMethodFilterSchema.optional(),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(2048).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
}).strict();
export type UserDirectoryInput = z.infer<typeof userDirectoryInputSchema>;

export type UsedActivation =
  | { source: "WORKFORCE"; purpose: WorkforceActivationPurpose; mode: WorkforceActivationMode; usedAt: Date }
  | { source: "PATIENT"; purpose: PatientActivationPurpose; usedAt: Date };

/** Pure status derivation; `userStatusWhere` below is its SQL twin and both must stay in step. */
export function deriveUserDirectoryStatus(input: {
  ended: boolean;
  relationshipSuspended: boolean;
  userStatus: UserStatus | null;
}): UserDirectoryStatus {
  if (input.ended) return "REMOVED";
  if (input.relationshipSuspended || input.userStatus === UserStatus.SUSPENDED) return "SUSPENDED";
  if (input.userStatus !== UserStatus.ACTIVE) return "PENDING";
  return "ACTIVE";
}

const isSelfRegistration = (activation: UsedActivation): boolean =>
  activation.purpose === WorkforceActivationPurpose.SELF_REGISTRATION;

/** Pure activation-method derivation; `activationMethodWhere` below is its SQL twin. */
export function deriveActivationMethod(input: {
  selfRegisteredAt: Date | null;
  userStatus: UserStatus | null;
  usedActivations: readonly UsedActivation[];
}): ActivationMethod {
  if (input.selfRegisteredAt || input.usedActivations.some(isSelfRegistration)) return "SELF_REGISTERED";
  if (input.userStatus === null || input.userStatus === UserStatus.PROVISIONED || input.userStatus === UserStatus.INVITED) {
    return "NOT_ACTIVATED";
  }
  if (input.usedActivations.some((activation) => activation.source === "WORKFORCE" &&
    activation.purpose === WorkforceActivationPurpose.ACTIVATION && activation.mode === WorkforceActivationMode.ASSISTED)) {
    return "ASSISTED";
  }
  if (input.usedActivations.some((activation) => activation.source === "PATIENT"
    ? activation.purpose === PatientActivationPurpose.ACTIVATION
    : activation.mode === WorkforceActivationMode.REMOTE && (activation.purpose === WorkforceActivationPurpose.ACTIVATION ||
      activation.purpose === WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING ||
      activation.purpose === WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING))) {
    return "INVITE";
  }
  return "OTHER";
}

/** The first credential: the earliest used activation of any first-credential purpose (RESET is not one). */
export function credentialEstablishedAt(usedActivations: readonly UsedActivation[]): Date | null {
  const times = usedActivations
    .filter((activation) => activation.source === "PATIENT" || activation.purpose !== WorkforceActivationPurpose.RESET)
    .map(({ usedAt }) => usedAt.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

const used = { usedAt: { not: null } } as const;
const usedSelfRegistration: Prisma.UserWhereInput = { OR: [
  { workforceActivations: { some: { ...used, purpose: WorkforceActivationPurpose.SELF_REGISTRATION } } },
  { patientActivations: { some: { ...used, purpose: PatientActivationPurpose.SELF_REGISTRATION } } },
] };
const usedAssisted: Prisma.UserWhereInput = {
  workforceActivations: { some: { ...used, purpose: WorkforceActivationPurpose.ACTIVATION, mode: WorkforceActivationMode.ASSISTED } },
};
const usedInvite: Prisma.UserWhereInput = { OR: [
  { workforceActivations: { some: { ...used, mode: WorkforceActivationMode.REMOTE,
    purpose: { in: [
      WorkforceActivationPurpose.ACTIVATION,
      WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING,
      WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING,
    ] } } } },
  { patientActivations: { some: { ...used, purpose: PatientActivationPurpose.ACTIVATION } } },
] };
const notActivatedStatuses = [UserStatus.PROVISIONED, UserStatus.INVITED];

/** Relationship-level filter, given how to reach the User from the relationship row. */
export function activationMethodWhere<W>(
  method: ActivationMethodFilter,
  wrapUser: (where: Prisma.UserWhereInput) => W,
): { OR?: W[]; selfRegisteredAt?: null; AND?: W[] } {
  switch (method) {
    case "SELF_REGISTERED":
      return { OR: [{ selfRegisteredAt: { not: null } } as W, wrapUser(usedSelfRegistration)] };
    case "NOT_ACTIVATED":
      return { selfRegisteredAt: null, AND: [wrapUser({ status: { in: notActivatedStatuses }, NOT: usedSelfRegistration })] };
    case "ASSISTED":
      return { selfRegisteredAt: null, AND: [wrapUser({ status: { notIn: notActivatedStatuses }, AND: [{ NOT: usedSelfRegistration }, usedAssisted] })] };
    case "INVITE":
      return { selfRegisteredAt: null, AND: [wrapUser({ status: { notIn: notActivatedStatuses },
        AND: [{ NOT: usedSelfRegistration }, { NOT: usedAssisted }, usedInvite] })] };
  }
}

/** Workforce (staff/OSM) relationship filter for a status bucket. */
export function workforceStatusWhere(status: UserDirectoryStatus): Prisma.HospitalMembershipWhereInput & Prisma.OsmHospitalRelationshipWhereInput {
  const live = { status: { notIn: [MembershipStatus.ENDED, MembershipStatus.SUSPENDED] } };
  switch (status) {
    case "REMOVED":
      return { status: MembershipStatus.ENDED };
    case "SUSPENDED":
      return { status: { not: MembershipStatus.ENDED }, OR: [{ status: MembershipStatus.SUSPENDED }, { user: { status: UserStatus.SUSPENDED } }] };
    case "PENDING":
      return { ...live, user: { status: { in: notActivatedStatuses } } };
    case "ACTIVE":
      return { ...live, user: { status: UserStatus.ACTIVE } };
  }
}

/** Patient relationship filter for a status bucket; a Patient has no relationship suspension, only the account lock. */
export function patientStatusWhere(status: UserDirectoryStatus): Prisma.PatientHospitalRelationshipWhereInput {
  const userIs = (where: Prisma.UserWhereInput) => ({ patientProfile: { person: { user: { is: where } } } });
  switch (status) {
    case "REMOVED":
      return { endedAt: { not: null } };
    case "SUSPENDED":
      return { endedAt: null, ...userIs({ status: UserStatus.SUSPENDED }) };
    case "PENDING":
      return { endedAt: null, ...userIs({ status: { in: notActivatedStatuses } }) };
    case "ACTIVE":
      return { endedAt: null, ...userIs({ status: UserStatus.ACTIVE }) };
  }
}
