import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  activePatientHospitalRelationshipWhere,
  isPatientHospitalRelationshipEnded,
} from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { decidePatientNameCorrectionPolicy } from "../policies/patient-name-correction-policy";
import {
  patientHospitalProfileRelationshipIdSchema,
  patientNameCorrectionLookupSchema,
  patientNameCorrectionSchema,
  workforceNameCorrectionTargetSchema,
} from "../schemas/patient-hospital-profile-schemas";

export type PatientNameCorrectionDatabase = PrismaClient;

/** E3: an OWNER asked to correct a Person shared with another Hospital ("กรุณาติดต่อผู้ดูแลระบบ"). */
export class PatientNameCorrectionRequiresAdminError extends ForbiddenError {
  constructor() {
    super("Patient name correction for a multi-hospital Person requires a platform ADMIN");
    this.name = "PatientNameCorrectionRequiresAdminError";
  }
}

export type PatientNameCorrectionTarget = {
  relationshipId: string;
  hospitalName: string;
  hospitalNumber: string | null;
  givenName: string | null;
  familyName: string | null;
  version: number;
};

async function loadActor(database: Prisma.TransactionClient | PrismaClient, actor: ActorContext) {
  return database.user.findFirst({
    where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE },
    select: {
      roles: { select: { role: true } },
      memberships: {
        where: { membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE, hospital: { is: { status: HospitalStatus.ACTIVE } } },
        select: { hospitalId: true },
      },
    },
  });
}

function isActivePlatformAdmin(
  actor: ActorContext,
  persisted: Awaited<ReturnType<typeof loadActor>>,
): boolean {
  return actor.roles.includes(Role.ADMIN) && Boolean(persisted?.roles.some(({ role }) => role === Role.ADMIN));
}

/** Every Hospital this Person relates to: non-ended Patient relationships plus non-ENDED staff and OSM relationships. */
export async function personHospitalIds(
  transaction: Prisma.TransactionClient,
  patientProfileId: string | null,
  userId: string | null,
): Promise<string[]> {
  const [patientRelationships, memberships, osmRelationships] = await Promise.all([
    patientProfileId
      ? transaction.patientHospitalRelationship.findMany({ where: { patientProfileId, ...activePatientHospitalRelationshipWhere }, select: { hospitalId: true } })
      : Promise.resolve([]),
    userId
      ? transaction.hospitalMembership.findMany({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { hospitalId: true } })
      : Promise.resolve([]),
    userId
      ? transaction.osmHospitalRelationship.findMany({ where: { userId, status: { not: MembershipStatus.ENDED } }, select: { hospitalId: true } })
      : Promise.resolve([]),
  ]);
  return [...patientRelationships, ...memberships, ...osmRelationships].map(({ hospitalId }) => hospitalId);
}

export async function correctPatientName(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  input: unknown,
  database: PatientNameCorrectionDatabase = getPrisma(),
): Promise<{ version: number }> {
  if (!actor) throw new ForbiddenError();
  const parsedRelationshipId = patientHospitalProfileRelationshipIdSchema.safeParse(relationshipId);
  if (!parsedRelationshipId.success) throw new NotFoundError();
  const parsed = patientNameCorrectionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient name data is invalid");

  try {
    return await runSerializableTransaction(database, async (transaction) => {
      const persistedActor = await loadActor(transaction, actor);
      if (!persistedActor) throw new ForbiddenError();

      const relationship = await transaction.patientHospitalRelationship.findUnique({
        where: { id: parsedRelationshipId.data },
        select: {
          hospitalId: true,
          endedAt: true,
          hospital: { select: { status: true } },
          patientProfile: {
            select: {
              id: true,
              person: { select: { id: true, givenName: true, familyName: true, version: true, user: { select: { id: true } } } },
            },
          },
        },
      });
      if (!relationship) throw new NotFoundError();

      const person = relationship.patientProfile.person;
      const decision = decidePatientNameCorrectionPolicy({
        isActivePlatformAdmin: isActivePlatformAdmin(actor, persistedActor),
        isActiveOwnerOfPatientHospital:
          actor.roles.includes(Role.HOSPITAL) &&
          persistedActor.roles.some(({ role }) => role === Role.HOSPITAL) &&
          relationship.hospital.status === HospitalStatus.ACTIVE &&
          // Phase F: an OWNER does no work through an ended relationship; the ADMIN path remains.
          !isPatientHospitalRelationshipEnded(relationship) &&
          persistedActor.memberships.some(({ hospitalId }) => hospitalId === relationship.hospitalId),
        patientHospitalId: relationship.hospitalId,
        personHospitalIds: await personHospitalIds(transaction, relationship.patientProfile.id, person.user?.id ?? null),
      });

      if (!decision.allowed) {
        if (decision.reason === "multi_hospital_requires_admin") throw new PatientNameCorrectionRequiresAdminError();
        throw new ForbiddenError();
      }

      return applyPersonNameCorrection(transaction, {
        actorUserId: actor.userId,
        action: "patient.person_name.corrected",
        person,
        input: parsed.data,
        metadata: { basis: decision.basis, hospitalId: relationship.hospitalId, relationshipId: parsedRelationshipId.data },
      });
    });
  } catch (error: unknown) {
    normalizeNameCorrectionError(error);
  }
}

/**
 * UM-1 (UM-D4): the same E3 rule for a staff or OSM relationship. Only the ACTIVE OWNER of the exact ACTIVE Hospital,
 * through a non-ENDED relationship, and only when every Hospital relationship of the Person is that Hospital; a
 * shared Person needs a platform ADMIN. The national ID is never part of this input.
 */
export async function correctWorkforcePersonName(
  actor: ActorContext | null | undefined,
  target: unknown,
  input: unknown,
  database: PatientNameCorrectionDatabase = getPrisma(),
): Promise<{ version: number }> {
  if (!actor) throw new ForbiddenError();
  const parsedTarget = workforceNameCorrectionTargetSchema.safeParse(target);
  if (!parsedTarget.success) throw new NotFoundError();
  const parsed = patientNameCorrectionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Person name data is invalid");
  const { kind, relationshipId } = parsedTarget.data;

  try {
    return await runSerializableTransaction(database, async (transaction) => {
      const persistedActor = await loadActor(transaction, actor);
      if (!persistedActor) throw new ForbiddenError();

      const relationshipSelect = {
        hospitalId: true,
        status: true,
        hospital: { select: { status: true } },
        user: {
          select: {
            id: true,
            person: { select: { id: true, givenName: true, familyName: true, version: true, patientProfile: { select: { id: true } } } },
          },
        },
      } as const;
      const relationship = kind === "staff"
        ? await transaction.hospitalMembership.findUnique({ where: { id: relationshipId }, select: relationshipSelect })
        : await transaction.osmHospitalRelationship.findUnique({ where: { id: relationshipId }, select: relationshipSelect });
      if (!relationship) throw new NotFoundError();

      const person = relationship.user.person;
      const decision = decidePatientNameCorrectionPolicy({
        isActivePlatformAdmin: false,
        isActiveOwnerOfPatientHospital:
          actor.roles.includes(Role.HOSPITAL) &&
          persistedActor.roles.some(({ role }) => role === Role.HOSPITAL) &&
          relationship.hospital.status === HospitalStatus.ACTIVE &&
          relationship.status !== MembershipStatus.ENDED &&
          persistedActor.memberships.some(({ hospitalId }) => hospitalId === relationship.hospitalId),
        patientHospitalId: relationship.hospitalId,
        personHospitalIds: await personHospitalIds(transaction, person.patientProfile?.id ?? null, relationship.user.id),
      });

      if (!decision.allowed) {
        if (decision.reason === "multi_hospital_requires_admin") throw new PatientNameCorrectionRequiresAdminError();
        // Another Hospital's relationship is indistinguishable from an unknown one.
        throw new NotFoundError();
      }

      return applyPersonNameCorrection(transaction, {
        actorUserId: actor.userId,
        action: "workforce.person_name.corrected",
        person,
        input: parsed.data,
        metadata: { basis: decision.basis, hospitalId: relationship.hospitalId, relationshipId, kind },
      });
    });
  } catch (error: unknown) {
    normalizeNameCorrectionError(error);
  }
}

/** Version CAS write plus audit shared by every E3 name correction (Patient and, since UM-1, staff/OSM). */
async function applyPersonNameCorrection(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    action: string;
    person: { id: string; givenName: string | null; familyName: string | null; version: number };
    input: { expectedVersion: number; givenName: string; familyName: string };
    metadata: Record<string, string>;
  },
): Promise<{ version: number }> {
  const { person, input: next } = input;
  if (person.version !== next.expectedVersion) throw new ConflictError("Person name changed");
  if (person.givenName === next.givenName && person.familyName === next.familyName) {
    throw new ConflictError("Person name is unchanged");
  }

  const updated = await transaction.person.updateMany({
    where: { id: person.id, version: next.expectedVersion },
    data: { givenName: next.givenName, familyName: next.familyName, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ConflictError("Person name changed");

  // Audit convention: no Person names in metadata; which parts changed plus versions identify the correction.
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: "Person",
    resourceId: person.id,
    metadata: {
      ...input.metadata,
      givenNameChanged: person.givenName !== next.givenName,
      familyNameChanged: person.familyName !== next.familyName,
      fromVersion: next.expectedVersion,
      toVersion: next.expectedVersion + 1,
    },
  }, transaction);

  return { version: next.expectedVersion + 1 };
}

function normalizeNameCorrectionError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
    throw new ConflictError("Person name changed");
  }
  throw new InfrastructureError("Person name could not be corrected");
}

/** E3 ADMIN entry: locate a Patient by exact Hospital and HN (as reported by the OWNER). */
export async function findPatientsForNameCorrection(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PatientNameCorrectionDatabase = getPrisma(),
): Promise<PatientNameCorrectionTarget[]> {
  if (!actor?.roles.includes(Role.ADMIN)) throw new ForbiddenError();
  const parsed = patientNameCorrectionLookupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient lookup data is invalid");

  try {
    if (!isActivePlatformAdmin(actor, await loadActor(database, actor))) throw new ForbiddenError();
    const rows = await database.patientHospitalRelationship.findMany({
      where: { hospitalId: parsed.data.hospitalId, hospitalNumber: parsed.data.hospitalNumber },
      orderBy: { id: "asc" },
      take: 5,
      select: {
        id: true,
        hospitalNumber: true,
        hospital: { select: { name: true } },
        patientProfile: { select: { person: { select: { givenName: true, familyName: true, version: true } } } },
      },
    });
    return rows.map((row) => ({
      relationshipId: row.id,
      hospitalName: row.hospital.name,
      hospitalNumber: row.hospitalNumber,
      givenName: row.patientProfile.person.givenName,
      familyName: row.patientProfile.person.familyName,
      version: row.patientProfile.person.version,
    }));
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Patient lookup could not be completed");
  }
}
