import "server-only";

import {
  IdentityAssurance,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { buildNameWhere } from "@/modules/patient-directory/services/patient-directory-query-service";
import { personHospitalIds } from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { decideWorkforcePolicy, WORKFORCE_CAPABILITIES } from "@/modules/workforce/policies/workforce-policy";
import { assertOwnerInDatabase } from "@/modules/workforce/services/workforce-service";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  activationMethodWhere,
  credentialEstablishedAt,
  deriveActivationMethod,
  deriveUserDirectoryStatus,
  patientStatusWhere,
  userDirectoryInputSchema,
  userRecordTargetSchema,
  workforceStatusWhere,
  type ActivationMethod,
  type UsedActivation,
  type UserDirectoryInput,
  type UserDirectoryStatus,
  type UserKind,
} from "../domain/user-management-values";
import { assessUserRecordDeletion, type UserRecordDeletionBlocker } from "./user-record-deletion-service";

export type UserDirectoryRow = {
  kind: UserKind;
  relationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  status: UserDirectoryStatus;
  identityAssurance: IdentityAssurance;
  method: ActivationMethod;
  selfRegisteredAt: Date | null;
  addedAt: Date;
};

export type UserDirectoryPage = {
  hospital: { id: string; hospitalCode: string; name: string };
  rows: UserDirectoryRow[];
  nextCursor: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function toDisplayName(person: { givenName: string | null; familyName: string | null }): string {
  return [person.givenName, person.familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ";
}

const usedActivationSelect = {
  status: true,
  identityAssurance: true,
  workforceActivations: { where: { usedAt: { not: null } }, select: { purpose: true, mode: true, usedAt: true } },
  patientActivations: { where: { usedAt: { not: null } }, select: { purpose: true, usedAt: true } },
} as const satisfies Prisma.UserSelect;

type UserActivationRecord = Prisma.UserGetPayload<{ select: typeof usedActivationSelect }>;

function usedActivationsOf(user: UserActivationRecord | null): UsedActivation[] {
  if (!user) return [];
  return [
    ...user.workforceActivations.map((activation) => ({ source: "WORKFORCE" as const, ...activation, usedAt: activation.usedAt! })),
    ...user.patientActivations.map((activation) => ({ source: "PATIENT" as const, ...activation, usedAt: activation.usedAt! })),
  ];
}

/** A cursor is bound to the exact Hospital, kind and filters it was issued for. */
function cursorContext(input: UserDirectoryInput): string {
  return createHash("sha256")
    .update(JSON.stringify([input.targetHospitalId, input.kind, input.status ?? null, input.method ?? null, input.search ?? ""]))
    .digest("hex")
    .slice(0, 32);
}

function readCursor(input: UserDirectoryInput): { createdAt: Date; id: string } | null {
  if (!input.cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { c?: unknown; t?: unknown; i?: unknown };
    if (decoded.c !== cursorContext(input) || typeof decoded.t !== "string" || typeof decoded.i !== "string") throw new Error("context");
    const createdAt = new Date(decoded.t);
    if (Number.isNaN(createdAt.getTime())) throw new Error("time");
    return { createdAt, id: decoded.i };
  } catch {
    throw new ValidationError("User directory pagination context is invalid");
  }
}

function writeCursor(input: UserDirectoryInput, row: { createdAt: Date; id: string } | undefined): string | null {
  return row
    ? Buffer.from(JSON.stringify({ c: cursorContext(input), t: row.createdAt.toISOString(), i: row.id }), "utf8").toString("base64url")
    : null;
}

const after = (cursor: { createdAt: Date; id: string } | null) => cursor
  ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
  : {};

async function findOwnedHospital(database: PrismaClient | Prisma.TransactionClient, actorUserId: string, hospitalId: string) {
  return database.hospital.findFirst({
    where: {
      id: hospitalId,
      status: HospitalStatus.ACTIVE,
      memberships: {
        some: {
          userId: actorUserId,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
          user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } },
        },
      },
    },
    select: { id: true, hospitalCode: true, name: true },
  });
}

/** UM-1 `/app/users`: one OWNER-only directory over staff, OSM and Patient records of the exact Hospital. */
export async function listHospitalUsers(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<UserDirectoryPage> {
  const parsed = userDirectoryInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("User directory selection is invalid");
  const query = parsed.data;
  if (!actor || !decideWorkforcePolicy({ actor, capability: WORKFORCE_CAPABILITIES.osmRead, targetHospitalId: query.targetHospitalId }).allowed) {
    throw new ForbiddenError();
  }
  const cursor = readCursor(query);
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = query.search ?? "";

  try {
    const hospital = await findOwnedHospital(database, actor.userId, query.targetHospitalId);
    if (!hospital) throw new ForbiddenError();
    const page = { take: pageSize + 1, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] };

    let rows: { row: UserDirectoryRow; key: { createdAt: Date; id: string } }[];
    if (query.kind === "patient") {
      const where: Prisma.PatientHospitalRelationshipWhereInput = {
        AND: [
          { hospitalId: hospital.id },
          query.status ? patientStatusWhere(query.status) : {},
          query.method ? activationMethodWhere(query.method, (user) => ({ patientProfile: { person: { user: { is: user } } } })) : {},
          search ? { OR: [{ hospitalNumber: search }, { patientProfile: { person: buildNameWhere(search) } }] } : {},
          after(cursor),
        ],
      };
      const relationships = await database.patientHospitalRelationship.findMany({
        where, ...page,
        select: {
          id: true, createdAt: true, endedAt: true, hospitalNumber: true, selfRegisteredAt: true,
          patientProfile: { select: { person: { select: { givenName: true, familyName: true, user: { select: usedActivationSelect } } } } },
        },
      });
      rows = relationships.map((relationship) => {
        const user = relationship.patientProfile.person.user;
        return { key: relationship, row: {
          kind: "patient" as const, relationshipId: relationship.id,
          displayName: toDisplayName(relationship.patientProfile.person), hospitalNumber: relationship.hospitalNumber,
          status: deriveUserDirectoryStatus({ ended: relationship.endedAt !== null, relationshipSuspended: false, userStatus: user?.status ?? null }),
          method: deriveActivationMethod({ selfRegisteredAt: relationship.selfRegisteredAt, userStatus: user?.status ?? null, usedActivations: usedActivationsOf(user) }),
          identityAssurance: user?.identityAssurance ?? IdentityAssurance.HOSPITAL_PROOFED,
          selfRegisteredAt: relationship.selfRegisteredAt, addedAt: relationship.createdAt,
        } };
      });
    } else {
      const where = {
        AND: [
          { hospitalId: hospital.id },
          query.status ? workforceStatusWhere(query.status) : {},
          query.method ? activationMethodWhere(query.method, (user) => ({ user })) : {},
          search ? { user: { person: buildNameWhere(search) } } : {},
          after(cursor),
        ],
      };
      const select = {
        id: true, createdAt: true, status: true, selfRegisteredAt: true,
        user: { select: { ...usedActivationSelect, person: { select: { givenName: true, familyName: true } } } },
      } as const;
      const relationships = query.kind === "staff"
        ? await database.hospitalMembership.findMany({ where: where as Prisma.HospitalMembershipWhereInput, ...page, select })
        : await database.osmHospitalRelationship.findMany({ where: where as Prisma.OsmHospitalRelationshipWhereInput, ...page, select });
      rows = relationships.map((relationship) => ({ key: relationship, row: {
        kind: query.kind, relationshipId: relationship.id,
        displayName: toDisplayName(relationship.user.person), hospitalNumber: null,
        status: deriveUserDirectoryStatus({
          ended: relationship.status === MembershipStatus.ENDED,
          relationshipSuspended: relationship.status === MembershipStatus.SUSPENDED,
          userStatus: relationship.user.status,
        }),
        method: deriveActivationMethod({ selfRegisteredAt: relationship.selfRegisteredAt, userStatus: relationship.user.status, usedActivations: usedActivationsOf(relationship.user) }),
        identityAssurance: relationship.user.identityAssurance,
        selfRegisteredAt: relationship.selfRegisteredAt, addedAt: relationship.createdAt,
      } }));
    }

    const visible = rows.slice(0, pageSize);
    return {
      hospital,
      rows: visible.map(({ row }) => row),
      nextCursor: rows.length > pageSize ? writeCursor(query, visible.at(-1)?.key) : null,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("User directory could not be loaded");
  }
}

export type UserTimelineEntry = { at: Date; label: string };

export type UserDetail = {
  kind: UserKind;
  relationshipId: string;
  hospital: { id: string; name: string };
  userId: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  personVersion: number;
  hospitalNumber: string | null;
  status: UserDirectoryStatus;
  accountStatus: UserStatus;
  identityAssurance: IdentityAssurance;
  relationshipUpdatedAt: string;
  activation: {
    method: ActivationMethod;
    activatedAt: Date | null;
    selfRegisteredAt: Date | null;
    addedAt: Date;
    addedByName: string | null;
  };
  takeoverLock: { lockedAt: Date; providerState: UserTakeoverProviderState } | null;
  timeline: UserTimelineEntry[];
  deletionBlockers: UserRecordDeletionBlocker[];
  singleHospital: boolean;
  takeoverBlock: "SELF" | "LOCKED" | "REMOVED" | "OWNER_MEMBERSHIP" | "NOT_ACTIVATED" | "REQUIRES_ADMIN" | null;
  /** The existing kind-specific page that keeps its own controls and history. */
  legacyHref: string;
};

/** Labels for the account history; unknown actions are skipped so nothing unreviewed is shown. */
const TIMELINE_LABELS: Record<string, string> = {
  "hospital_membership.provisioned": "เพิ่มเข้าระบบ",
  "osm_relationship.provisioned": "เพิ่มเข้าระบบ",
  "patient.provisioned": "เพิ่มเข้าระบบ",
  "workforce_activation.issued": "ออกลิงก์เปิดใช้งาน",
  "patient_activation.issued": "ออกลิงก์เปิดใช้งาน",
  PATIENT_ACCESS_ACTIVATION_ISSUED: "ออกลิงก์เปิดใช้งาน",
  "workforce_activation.revoked": "ยกเลิกลิงก์เปิดใช้งาน",
  "patient_activation.revoked": "ยกเลิกลิงก์เปิดใช้งาน",
  "workforce_activation.completed": "เปิดใช้งานบัญชี",
  "patient_activation.completed": "เปิดใช้งานบัญชี",
  "workforce_password_reset.issued": "ออกลิงก์รีเซ็ตรหัสผ่าน",
  "workforce_password_reset.completed": "รีเซ็ตรหัสผ่านแล้ว",
  "account.password_reset.issued": "ออกลิงก์รีเซ็ตรหัสผ่านแบบยืนยันตัวตน",
  "account.password_reset.completed": "เปลี่ยนรหัสผ่านและคืนบัญชีแล้ว",
  "hospital_membership.suspended": "ระงับสิทธิ์",
  "osm_relationship.suspended": "ระงับสิทธิ์",
  "hospital_membership.restored": "คืนสิทธิ์",
  "osm_relationship.restored": "คืนสิทธิ์",
  "hospital_membership.profession_changed": "เปลี่ยนวิชาชีพ",
  "hospital_owner.promoted": "แต่งตั้งเป็นเจ้าของโรงพยาบาล",
  "hospital_owner.demoted": "ถอดจากเจ้าของโรงพยาบาล",
  "workforce.permanently_released": "นำออกจากระบบ",
  "patient.hospital_relationship.ended": "สิ้นสุดการดูแล",
  "patient.person_name.corrected": "แก้ไขชื่อ-สกุล",
  "workforce.person_name.corrected": "แก้ไขชื่อ-สกุล",
  "user.takeover_locked": "ล็อกบัญชี: แจ้งว่าไม่ใช่เจ้าของจริง",
  "user.takeover_provider_sessions": "ตรวจสอบการยกเลิกการเข้าสู่ระบบ",
  "user.takeover_lock_resolved": "คืนสิทธิ์ที่ถูกระงับจากการล็อกบัญชี",
};

const ADDED_ACTIONS = ["hospital_membership.provisioned", "osm_relationship.provisioned", "patient.provisioned"];

const detailUserSelect = {
  id: true,
  ...usedActivationSelect,
  takeoverLock: { select: { lockedAt: true, providerState: true, hospitalId: true } },
  person: { select: { id: true, givenName: true, familyName: true, version: true, patientProfile: { select: { id: true } } } },
} as const satisfies Prisma.UserSelect;

async function loadDetailRecord(transaction: Prisma.TransactionClient, kind: UserKind, relationshipId: string) {
  if (kind === "patient") {
    const row = await transaction.patientHospitalRelationship.findUnique({
      where: { id: relationshipId },
      select: {
        id: true, hospitalId: true, createdAt: true, updatedAt: true, endedAt: true, hospitalNumber: true, selfRegisteredAt: true,
        hospital: { select: { id: true, name: true } },
        patientProfile: { select: { person: { select: { user: { select: detailUserSelect } } } } },
      },
    });
    const user = row?.patientProfile.person.user;
    return row && user ? { ...row, ended: row.endedAt !== null, suspended: false, ownerMembership: false, user } : null;
  }
  const select = {
    id: true, hospitalId: true, createdAt: true, updatedAt: true, status: true, selfRegisteredAt: true,
    hospital: { select: { id: true, name: true } },
    user: { select: detailUserSelect },
  } as const;
  const row = kind === "staff"
    ? await transaction.hospitalMembership.findUnique({ where: { id: relationshipId }, select: { ...select, membershipType: true } })
    : await transaction.osmHospitalRelationship.findUnique({ where: { id: relationshipId }, select });
  return row
    ? {
        ...row,
        hospitalNumber: null,
        ended: row.status === MembershipStatus.ENDED,
        suspended: row.status === MembershipStatus.SUSPENDED,
        ownerMembership: "membershipType" in row && row.membershipType === MembershipType.OWNER,
      }
    : null;
}

/** UM-1 unified detail: everything the action panel needs, decided on the server for the persisted OWNER. */
export async function getHospitalUserDetail(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<UserDetail> {
  const parsed = userRecordTargetSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  if (!actor) throw new ForbiddenError();
  const { kind, relationshipId } = parsed.data;

  try {
    return await database.$transaction(async (transaction) => {
      const record = await loadDetailRecord(transaction, kind, relationshipId);
      if (!record) throw new NotFoundError();
      // Another Hospital's record is indistinguishable from an unknown one.
      await assertOwnerInDatabase(transaction, actor.userId, record.hospitalId).catch((error: unknown) => {
        throw error instanceof ForbiddenError ? new NotFoundError() : error;
      });

      const user = record.user;
      const usedActivations = usedActivationsOf(user);
      const [assessment, hospitals, workforceActivationIds, patientActivationIds] = await Promise.all([
        assessUserRecordDeletion(transaction, kind, record.hospitalId, record.id),
        personHospitalIds(transaction, user.person.patientProfile?.id ?? null, user.id),
        transaction.workforceActivation.findMany({ where: { userId: user.id, OR: [{ hospitalId: record.hospitalId }, { hospitalId: null }] }, select: { id: true } }),
        transaction.patientActivation.findMany({ where: { userId: user.id, hospitalId: record.hospitalId }, select: { id: true } }),
      ]);
      const relationshipResourceType = kind === "staff" ? "HospitalMembership" : kind === "osm" ? "OsmHospitalRelationship" : "PatientHospitalRelationship";
      const events = await transaction.auditEvent.findMany({
        where: {
          action: { in: Object.keys(TIMELINE_LABELS) },
          OR: [
            { resourceType: relationshipResourceType, resourceId: record.id },
            { resourceType: "User", resourceId: user.id },
            { resourceType: "Person", resourceId: user.person.id, metadata: { path: ["relationshipId"], equals: record.id } },
            { resourceType: "WorkforceActivation", resourceId: { in: workforceActivationIds.map(({ id }) => id) } },
            { resourceType: "PatientActivation", resourceId: { in: patientActivationIds.map(({ id }) => id) } },
            ...(user.person.patientProfile
              ? [{ resourceType: "PatientProfile", resourceId: user.person.patientProfile.id, action: "patient.provisioned", metadata: { path: ["relationshipId"], equals: record.id } }]
              : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: { action: true, createdAt: true, actor: { select: { person: { select: { givenName: true, familyName: true } } } } },
      });
      const added = [...events].reverse().find(({ action }) => ADDED_ACTIONS.includes(action));
      const timeline: UserTimelineEntry[] = events.map(({ action, createdAt }) => ({ at: createdAt, label: TIMELINE_LABELS[action] ?? action }));
      if (record.selfRegisteredAt) timeline.push({ at: record.selfRegisteredAt, label: "ลงทะเบียนเองด้วยเลขบัตรประชาชน" });
      timeline.sort((left, right) => right.at.getTime() - left.at.getTime());

      const singleHospital = new Set(hospitals).size === 1 && hospitals.includes(record.hospitalId);
      const status = deriveUserDirectoryStatus({ ended: record.ended, relationshipSuspended: record.suspended, userStatus: user.status });
      const takeoverBlock: UserDetail["takeoverBlock"] = user.id === actor.userId ? "SELF"
          : user.takeoverLock && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED ? "LOCKED"
          : record.ended ? "REMOVED"
            : record.ownerMembership ? "OWNER_MEMBERSHIP"
              : user.status !== UserStatus.ACTIVE ? "NOT_ACTIVATED"
                : !singleHospital ? "REQUIRES_ADMIN" : null;

      return {
        kind,
        relationshipId: record.id,
        hospital: record.hospital,
        userId: user.id,
        displayName: toDisplayName(user.person),
        givenName: user.person.givenName,
        familyName: user.person.familyName,
        personVersion: user.person.version,
        hospitalNumber: record.hospitalNumber,
        status,
        accountStatus: user.status,
        identityAssurance: user.identityAssurance,
        relationshipUpdatedAt: record.updatedAt.toISOString(),
        activation: {
          method: deriveActivationMethod({ selfRegisteredAt: record.selfRegisteredAt, userStatus: user.status, usedActivations }),
          activatedAt: credentialEstablishedAt(usedActivations),
          selfRegisteredAt: record.selfRegisteredAt,
          addedAt: record.createdAt,
          addedByName: added?.actor ? toDisplayName(added.actor.person) : null,
        },
        takeoverLock: user.takeoverLock && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED
          ? { lockedAt: user.takeoverLock.lockedAt, providerState: user.takeoverLock.providerState }
          : null,
        timeline,
        deletionBlockers: assessment?.blockers ?? ["UNKNOWN_RELATION"],
        singleHospital,
        takeoverBlock,
        legacyHref: kind === "patient" ? `/app/patients/${record.id}` : `/app/workforce/${kind}/${record.id}`,
      };
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("User detail could not be loaded");
  }
}
