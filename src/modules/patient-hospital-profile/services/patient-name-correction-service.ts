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

/** Every Hospital this Person relates to: Patient relationships plus non-ENDED staff and OSM relationships. */
async function personHospitalIds(
  transaction: Prisma.TransactionClient,
  patientProfileId: string,
  userId: string | null,
): Promise<string[]> {
  const [patientRelationships, memberships, osmRelationships] = await Promise.all([
    transaction.patientHospitalRelationship.findMany({ where: { patientProfileId }, select: { hospitalId: true } }),
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
          persistedActor.memberships.some(({ hospitalId }) => hospitalId === relationship.hospitalId),
        patientHospitalId: relationship.hospitalId,
        personHospitalIds: await personHospitalIds(transaction, relationship.patientProfile.id, person.user?.id ?? null),
      });

      if (!decision.allowed) {
        if (decision.reason === "multi_hospital_requires_admin") throw new PatientNameCorrectionRequiresAdminError();
        throw new ForbiddenError();
      }

      if (person.version !== parsed.data.expectedVersion) throw new ConflictError("Patient name changed");
      if (person.givenName === parsed.data.givenName && person.familyName === parsed.data.familyName) {
        throw new ConflictError("Patient name is unchanged");
      }

      const updated = await transaction.person.updateMany({
        where: { id: person.id, version: parsed.data.expectedVersion },
        data: { givenName: parsed.data.givenName, familyName: parsed.data.familyName, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictError("Patient name changed");

      // Audit convention: no Person names in metadata; which parts changed plus versions identify the correction.
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "patient.person_name.corrected",
        resourceType: "Person",
        resourceId: person.id,
        metadata: {
          basis: decision.basis,
          hospitalId: relationship.hospitalId,
          relationshipId: parsedRelationshipId.data,
          givenNameChanged: person.givenName !== parsed.data.givenName,
          familyNameChanged: person.familyName !== parsed.data.familyName,
          fromVersion: parsed.data.expectedVersion,
          toVersion: parsed.data.expectedVersion + 1,
        },
      }, transaction);

      return { version: parsed.data.expectedVersion + 1 };
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      throw new ConflictError("Patient name changed");
    }
    throw new InfrastructureError("Patient name could not be corrected");
  }
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
