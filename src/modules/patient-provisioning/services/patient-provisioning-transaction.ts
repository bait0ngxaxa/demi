import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  createIdentityStore,
  resolvePerson,
} from "@/modules/identity/services/identity-service";
import {
  ConflictError,
  ForbiddenError,
} from "@/shared/errors/application-error";

import {
  assertPatientBulkProvisioningPolicy,
  assertPatientProvisioningPolicy,
  PATIENT_PROVISIONING_CAPABILITY,
  patientProvisioningPolicyInternals,
} from "../policies/patient-provisioning-policy";
import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
export type PatientTransactionDatabase = Prisma.TransactionClient | PrismaClient;
export type PatientProvisioningAuthorizationMode = "SINGLE" | "BULK";
export type PatientProvisioningOutcome = "CREATED" | "ALREADY_PROVISIONED";

export type PatientProvisioningResult = {
  outcome: PatientProvisioningOutcome;
  personId: string;
  userId: string;
  patientProfileId: string;
  relationshipId: string;
  hospitalId: string;
  accountStatus: UserStatus;
  reusedExistingUser: boolean;
};

export type PatientProvisioningConflictKind =
  | "IDENTITY_CONFLICT"
  | "RELATIONSHIP_CONFLICT"
  | "RECONCILIATION_REQUIRED";

export class PatientProvisioningConflictError extends ConflictError {
  readonly kind: PatientProvisioningConflictKind;

  constructor(kind: PatientProvisioningConflictKind, message: string) {
    super(message);
    this.name = "PatientProvisioningConflictError";
    this.kind = kind;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function assertReusableUser(user: {
  status: UserStatus;
  authSubject: string | null;
}): void {
  if (user.status === UserStatus.ACTIVE && user.authSubject && isUuid(user.authSubject)) {
    return;
  }

  if (user.status === UserStatus.PROVISIONED && !user.authSubject) {
    return;
  }

  throw new PatientProvisioningConflictError(
    "RECONCILIATION_REQUIRED",
    "The existing account requires reconciliation before patient provisioning",
  );
}

function assertActorPolicy(
  actor: ActorContext,
  targetHospitalId: string,
  authorizationMode: PatientProvisioningAuthorizationMode,
): void {
  if (authorizationMode === "BULK") {
    assertPatientBulkProvisioningPolicy({
      actor,
      capability: PATIENT_PROVISIONING_CAPABILITY,
      targetHospitalId,
    });
    return;
  }

  assertPatientProvisioningPolicy({
    actor,
    capability: PATIENT_PROVISIONING_CAPABILITY,
    targetHospitalId,
  });
}

export async function assertPatientProvisioningActorInDatabase(
  database: PatientTransactionDatabase,
  actorUserId: string,
  targetHospitalId: string,
  authorizationMode: PatientProvisioningAuthorizationMode,
): Promise<void> {
  const actor = await database.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (!actor || actor.status !== UserStatus.ACTIVE) {
    throw new ForbiddenError();
  }

  const hospital = await database.hospital.findUnique({
    where: { id: targetHospitalId },
    select: { status: true },
  });

  if (!hospital || hospital.status !== HospitalStatus.ACTIVE) {
    throw new ForbiddenError();
  }

  const hasHospitalRole = actor.roles.some(({ role }) => role === Role.HOSPITAL);
  const hasOsmRole =
    authorizationMode === "SINGLE" && actor.roles.some(({ role }) => role === Role.OSM);

  const directMembership = hasHospitalRole
    ? await database.hospitalMembership.findFirst({
        where: {
          userId: actorUserId,
          hospitalId: targetHospitalId,
          status: MembershipStatus.ACTIVE,
        },
        select: { membershipType: true, status: true },
      })
    : null;

  const osmRelationship = hasOsmRole
    ? await database.osmHospitalRelationship.findUnique({
        where: {
          userId_hospitalId: {
            userId: actorUserId,
            hospitalId: targetHospitalId,
          },
        },
        select: { status: true },
      })
    : null;

  const hasDirectScope = Boolean(
    directMembership &&
      patientProvisioningPolicyInternals.isActiveDirectHospitalScope({
        membershipType: directMembership.membershipType,
        status: directMembership.status,
        hospitalStatus: hospital.status,
      }),
  );
  const hasOsmScope = Boolean(
    osmRelationship &&
      patientProvisioningPolicyInternals.isActiveOsmHospitalScope({
        status: osmRelationship.status,
        hospitalStatus: hospital.status,
      }),
  );

  const authorized =
    authorizationMode === "BULK" ? hasDirectScope : hasDirectScope || hasOsmScope;

  if (!authorized) {
    throw new ForbiddenError();
  }
}

async function resolvePatientPerson(
  transaction: Prisma.TransactionClient,
  input: ProvisionPatientInput,
): Promise<{
  person: {
    id: string;
    givenName: string | null;
    familyName: string | null;
  };
  changed: boolean;
}> {
  const resolved = await resolvePerson(
    {
      identity: input.identity,
      givenName: input.givenName,
      familyName: input.familyName,
    },
    createIdentityStore(transaction),
  );

  if (
    (resolved.givenName && resolved.givenName !== input.givenName) ||
    (resolved.familyName && resolved.familyName !== input.familyName)
  ) {
    throw new PatientProvisioningConflictError(
      "IDENTITY_CONFLICT",
      "The existing Person has conflicting authoritative name data",
    );
  }

  const data: Prisma.PersonUpdateInput = {};

  if (!resolved.givenName) {
    data.givenName = input.givenName;
  }

  if (!resolved.familyName) {
    data.familyName = input.familyName;
  }

  if (Object.keys(data).length === 0) {
    return {
      person: {
        id: resolved.id,
        givenName: resolved.givenName,
        familyName: resolved.familyName,
      },
      changed: false,
    };
  }

  const updated = await transaction.person.update({
    where: { id: resolved.id },
    data,
    select: { id: true, givenName: true, familyName: true },
  });

  return { person: updated, changed: true };
}

export async function provisionPatientInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: ProvisionPatientInput,
  authorizationMode: PatientProvisioningAuthorizationMode,
): Promise<PatientProvisioningResult> {
  assertActorPolicy(actor, input.targetHospitalId, authorizationMode);
  await assertPatientProvisioningActorInDatabase(
    transaction,
    actor.userId,
    input.targetHospitalId,
    authorizationMode,
  );

  const personState = await resolvePatientPerson(transaction, input);
  let user = await transaction.user.findUnique({
    where: { personId: personState.person.id },
    select: { id: true, personId: true, status: true, authSubject: true },
  });
  const reusedExistingUser = user !== null;
  let changed = personState.changed;

  if (!user) {
    user = await transaction.user.create({
      data: {
        personId: personState.person.id,
        status: UserStatus.PROVISIONED,
      },
      select: { id: true, personId: true, status: true, authSubject: true },
    });
    changed = true;
  }

  assertReusableUser(user);

  const existingPatientRole = await transaction.userRole.findUnique({
    where: {
      userId_role: {
        userId: user.id,
        role: Role.PATIENT,
      },
    },
    select: { userId: true },
  });

  if (!existingPatientRole) {
    await transaction.userRole.create({
      data: { userId: user.id, role: Role.PATIENT },
    });
    changed = true;
  }

  let patientProfile = await transaction.patientProfile.findUnique({
    where: { personId: personState.person.id },
    select: { id: true },
  });

  if (!patientProfile) {
    patientProfile = await transaction.patientProfile.create({
      data: { personId: personState.person.id },
      select: { id: true },
    });
    changed = true;
  }

  let relationship = await transaction.patientHospitalRelationship.findUnique({
    where: {
      patientProfileId_hospitalId: {
        patientProfileId: patientProfile.id,
        hospitalId: input.targetHospitalId,
      },
    },
    select: { id: true, hospitalNumber: true },
  });

  if (relationship) {
    if (
      input.hospitalNumber &&
      relationship.hospitalNumber &&
      relationship.hospitalNumber !== input.hospitalNumber
    ) {
      throw new PatientProvisioningConflictError(
        "RELATIONSHIP_CONFLICT",
        "The existing Hospital relationship has a different HN",
      );
    }

    if (!relationship.hospitalNumber && input.hospitalNumber) {
      relationship = await transaction.patientHospitalRelationship.update({
        where: { id: relationship.id },
        data: { hospitalNumber: input.hospitalNumber },
        select: { id: true, hospitalNumber: true },
      });
      changed = true;
    }
  } else {
    relationship = await transaction.patientHospitalRelationship.create({
      data: {
        patientProfileId: patientProfile.id,
        hospitalId: input.targetHospitalId,
        hospitalNumber: input.hospitalNumber,
      },
      select: { id: true, hospitalNumber: true },
    });
    changed = true;
  }

  const outcome: PatientProvisioningOutcome = changed ? "CREATED" : "ALREADY_PROVISIONED";

  if (changed) {
    await recordAuditEvent(
      {
        actorUserId: actor.userId,
        action: "patient.provisioned",
        resourceType: "PatientProfile",
        resourceId: patientProfile.id,
        metadata: {
          outcome,
          hospitalId: input.targetHospitalId,
          relationshipId: relationship.id,
          accountStatus: user.status,
          role: Role.PATIENT,
        },
      },
      transaction,
    );
  }

  return {
    outcome,
    personId: personState.person.id,
    userId: user.id,
    patientProfileId: patientProfile.id,
    relationshipId: relationship.id,
    hospitalId: input.targetHospitalId,
    accountStatus: user.status,
    reusedExistingUser,
  };
}

export const patientProvisioningTransactionInternals = {
  assertActorPolicy,
  assertReusableUser,
  resolvePatientPerson,
};
