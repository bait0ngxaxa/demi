import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  createIdentityStore,
  hashIdentityReference,
  resolvePerson,
} from "@/modules/identity/services/identity-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  assertPatientBulkProvisioningPolicy,
  assertPatientProvisioningPolicy,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
  PATIENT_PROVISIONING_CAPABILITY,
  patientProvisioningPolicyInternals,
} from "../policies/patient-provisioning-policy";
import {
  patientProvisionInputSchema,
  patientProvisionScopeSchema,
  type ProvisionPatientInput,
} from "../schemas/patient-provisioning-schemas";

export type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";

export type PatientDatabase = PrismaClient;
export type PatientTransactionDatabase = Prisma.TransactionClient | PrismaClient;

type PatientProvisioningAuthorizationMode = "SINGLE" | "BULK";

export type PatientProvisioningServiceDependencies = {
  database?: PatientDatabase;
  transactionRetries?: number;
};

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

export type PatientProvisioningScope = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  canBulkImport: boolean;
};

export type PatientImportClassification =
  | "READY"
  | "ALREADY_EXISTS"
  | "DUPLICATE_IN_FILE"
  | "INVALID"
  | "CONFLICT";

export type PatientProvisioningImportCandidate = {
  rowNumber: number;
  identityDisplay: string;
  input: ProvisionPatientInput | null;
  givenName: string;
  familyName: string;
  hospitalNumber: string | null;
  validationMessage: string | null;
};

export type PatientImportPreviewRow = {
  rowNumber: number;
  identityDisplay: string;
  givenName: string;
  familyName: string;
  hospitalNumber: string | null;
  classification: PatientImportClassification;
  reason: string | null;
};

export type PatientImportPreview = {
  targetHospitalId: string;
  rows: PatientImportPreviewRow[];
};

export type PatientImportRowResult = PatientImportPreviewRow & {
  result:
    | "IMPORTED"
    | "ALREADY_EXISTS"
    | "DUPLICATE_IN_FILE"
    | "INVALID"
    | "CONFLICT"
    | "FAILED";
};

export type PatientImportResultSummary = {
  targetHospitalId: string;
  imported: number;
  alreadyExists: number;
  duplicateInFile: number;
  invalid: number;
  conflict: number;
  failed: number;
  rows: PatientImportRowResult[];
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

const DEFAULT_TRANSACTION_RETRIES = 2;

function getDatabase(dependencies: PatientProvisioningServiceDependencies): PatientDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new PatientProvisioningConflictError(
      "RECONCILIATION_REQUIRED",
      "Patient provisioning conflicted with another request",
    );
  }

  if (isKnownRequestError(error, "P2034")) {
    return new PatientProvisioningConflictError(
      "RECONCILIATION_REQUIRED",
      "Patient provisioning conflicted with another request",
    );
  }

  return new InfrastructureError("Patient provisioning could not be completed");
}

async function runSerializable<T>(
  database: PatientDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
    }
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

async function assertActorCanProvisionInDatabase(
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

async function createOrReusePatientState(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  input: ProvisionPatientInput,
  authorizationMode: PatientProvisioningAuthorizationMode,
): Promise<PatientProvisioningResult> {
  await assertActorCanProvisionInDatabase(
    transaction,
    actorUserId,
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
        actorUserId,
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

async function provisionPatientWithAuthorizationMode(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
  authorizationMode: PatientProvisioningAuthorizationMode,
): Promise<PatientProvisioningResult> {
  const parsed = patientProvisionInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient provisioning data is invalid");
  }

  if (authorizationMode === "BULK") {
    assertPatientBulkProvisioningPolicy({
      actor,
      capability: PATIENT_PROVISIONING_CAPABILITY,
      targetHospitalId: parsed.data.targetHospitalId,
    });
  } else {
    assertPatientProvisioningPolicy({
      actor,
      capability: PATIENT_PROVISIONING_CAPABILITY,
      targetHospitalId: parsed.data.targetHospitalId,
    });
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const result = await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        createOrReusePatientState(
          transaction,
          actor.userId,
          parsed.data,
          authorizationMode,
        ),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    return result;
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function provisionPatient(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientProvisioningResult> {
  return provisionPatientWithAuthorizationMode(actor, input, dependencies, "SINGLE");
}

export async function listPatientProvisioningScopes(
  actor: ActorContext | null | undefined,
  database: PatientDatabase = getPrisma(),
): Promise<PatientProvisioningScope[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const currentActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: {
        status: true,
        roles: { select: { role: true } },
        memberships: {
          select: {
            hospitalId: true,
            membershipType: true,
            status: true,
            hospital: { select: { hospitalCode: true, name: true, status: true } },
          },
        },
        osmHospitalRelationships: {
          select: {
            hospitalId: true,
            status: true,
            hospital: { select: { hospitalCode: true, name: true, status: true } },
          },
        },
      },
    });

    if (!currentActor || currentActor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError();
    }

    const roles = new Set(currentActor.roles.map(({ role }) => role));
    const scopes = new Map<string, PatientProvisioningScope>();

    if (roles.has(Role.HOSPITAL)) {
      for (const membership of currentActor.memberships) {
        if (
          !patientProvisioningPolicyInternals.isActiveDirectHospitalScope({
            membershipType: membership.membershipType,
            status: membership.status,
            hospitalStatus: membership.hospital.status,
          })
        ) {
          continue;
        }

        scopes.set(membership.hospitalId, {
          hospitalId: membership.hospitalId,
          hospitalCode: membership.hospital.hospitalCode,
          hospitalName: membership.hospital.name,
          canBulkImport: true,
        });
      }
    }

    if (roles.has(Role.OSM)) {
      for (const relationship of currentActor.osmHospitalRelationships) {
        if (
          !patientProvisioningPolicyInternals.isActiveOsmHospitalScope({
            status: relationship.status,
            hospitalStatus: relationship.hospital.status,
          })
        ) {
          continue;
        }

        const existing = scopes.get(relationship.hospitalId);
        scopes.set(relationship.hospitalId, {
          hospitalId: relationship.hospitalId,
          hospitalCode: relationship.hospital.hospitalCode,
          hospitalName: relationship.hospital.name,
          canBulkImport: existing?.canBulkImport ?? false,
        });
      }
    }

    return [...scopes.values()].sort((left, right) =>
      `${left.hospitalName}\u0000${left.hospitalCode}`.localeCompare(
        `${right.hospitalName}\u0000${right.hospitalCode}`,
        "th",
      ),
    );
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient provisioning scope could not be loaded");
  }
}

type PreviewPerson = {
  id: string;
  identityKeyHash: string;
  givenName: string | null;
  familyName: string | null;
  user: {
    id: string;
    status: UserStatus;
    authSubject: string | null;
    roles: { role: Role }[];
  } | null;
  patientProfile: {
    id: string;
    hospitalRelationships: { id: string; hospitalNumber: string | null }[];
  } | null;
};

function hasNameConflict(
  person: Pick<PreviewPerson, "givenName" | "familyName">,
  input: ProvisionPatientInput,
): boolean {
  return Boolean(
    (person.givenName && person.givenName !== input.givenName) ||
      (person.familyName && person.familyName !== input.familyName),
  );
}

function classifyExistingPatient(
  existing: PreviewPerson,
  input: ProvisionPatientInput,
): { classification: PatientImportClassification; reason: string | null } {
  if (hasNameConflict(existing, input)) {
    return {
      classification: "CONFLICT",
      reason: "ข้อมูลชื่อของบุคคลเดิมไม่ตรงกัน ต้องตรวจสอบโดยผู้ดูแล",
    };
  }

  if (existing.user) {
    try {
      assertReusableUser(existing.user);
    } catch {
      return {
        classification: "CONFLICT",
        reason: "บัญชีเดิมอยู่ในสถานะที่ต้องตรวจสอบก่อนใช้งาน",
      };
    }
  }

  const relationship = existing.patientProfile?.hospitalRelationships[0];

  if (
    relationship?.hospitalNumber &&
    input.hospitalNumber &&
    relationship.hospitalNumber !== input.hospitalNumber
  ) {
    return {
      classification: "CONFLICT",
      reason: "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน",
    };
  }

  const hasPatientRole = existing.user?.roles.some(({ role }) => role === Role.PATIENT) ?? false;

  if (relationship && hasPatientRole) {
    return { classification: "ALREADY_EXISTS", reason: "มีข้อมูลผู้ป่วยและความสัมพันธ์นี้แล้ว" };
  }

  return { classification: "READY", reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };
}

function toPreviewRow(
  candidate: PatientProvisioningImportCandidate,
  classification: PatientImportClassification,
  reason: string | null,
): PatientImportPreviewRow {
  return {
    rowNumber: candidate.rowNumber,
    identityDisplay: candidate.identityDisplay,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    hospitalNumber: candidate.hospitalNumber,
    classification,
    reason,
  };
}

function normalizeImportCandidates(
  candidates: readonly PatientProvisioningImportCandidate[],
  targetHospitalId: string,
): PatientProvisioningImportCandidate[] {
  return candidates.map((candidate) => {
    if (!candidate.input) {
      return candidate;
    }

    const parsed = patientProvisionInputSchema.safeParse(candidate.input);

    if (!parsed.success) {
      return {
        ...candidate,
        input: null,
        validationMessage: "ข้อมูลแถวนี้ไม่ถูกต้อง",
      };
    }

    if (parsed.data.targetHospitalId !== targetHospitalId) {
      return {
        ...candidate,
        input: null,
        validationMessage: "แถวนี้อยู่นอกขอบเขตโรงพยาบาลที่เลือก",
      };
    }

    return {
      ...candidate,
      input: parsed.data,
      givenName: parsed.data.givenName,
      familyName: parsed.data.familyName,
      hospitalNumber: parsed.data.hospitalNumber ?? null,
      validationMessage: null,
    };
  });
}

export async function previewPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  database: PatientDatabase = getPrisma(),
): Promise<PatientImportPreview> {
  const parsedScope = patientProvisionScopeSchema.safeParse({ targetHospitalId });

  if (!parsedScope.success) {
    throw new ValidationError("Patient import Hospital scope is invalid");
  }

  assertPatientBulkProvisioningPolicy({
    actor,
    capability: PATIENT_PROVISIONING_CAPABILITY,
    targetHospitalId: parsedScope.data.targetHospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const normalizedCandidates = normalizeImportCandidates(
      candidates,
      parsedScope.data.targetHospitalId,
    );

    await assertActorCanProvisionInDatabase(
      database,
      actor.userId,
      parsedScope.data.targetHospitalId,
      "BULK",
    );

    const hashByRow = new Map<number, string>();
    const counts = new Map<string, number>();

    for (const candidate of normalizedCandidates) {
      if (!candidate.input) {
        continue;
      }

      const hash = hashIdentityReference(candidate.input.identity);
      hashByRow.set(candidate.rowNumber, hash);
      counts.set(hash, (counts.get(hash) ?? 0) + 1);
    }

    const hashes = [...counts.keys()];
    const people = hashes.length
      ? await database.person.findMany({
          where: { identityKeyHash: { in: hashes } },
          select: {
            id: true,
            identityKeyHash: true,
            givenName: true,
            familyName: true,
            user: {
              select: {
                id: true,
                status: true,
                authSubject: true,
                roles: { select: { role: true } },
              },
            },
            patientProfile: {
              select: {
                id: true,
                hospitalRelationships: {
                  where: { hospitalId: targetHospitalId },
                  select: { id: true, hospitalNumber: true },
                },
              },
            },
          },
        })
      : [];
    const existingByHash = new Map<string, PreviewPerson>(
      people.map((person) => [person.identityKeyHash, person]),
    );

    return {
      targetHospitalId: parsedScope.data.targetHospitalId,
      rows: normalizedCandidates.map((candidate) => {
        if (!candidate.input) {
          return toPreviewRow(candidate, "INVALID", candidate.validationMessage);
        }

        const hash = hashByRow.get(candidate.rowNumber);
        const isDuplicate = hash ? (counts.get(hash) ?? 0) > 1 : false;

        if (isDuplicate) {
          return toPreviewRow(candidate, "DUPLICATE_IN_FILE", "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน");
        }

        const existing = hash ? existingByHash.get(hash) : undefined;

        if (!existing) {
          return toPreviewRow(candidate, "READY", "พร้อมบันทึกข้อมูลผู้ป่วย");
        }

        const classification = classifyExistingPatient(existing, candidate.input);
        return toPreviewRow(candidate, classification.classification, classification.reason);
      }),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient import preview could not be prepared");
  }
}

function toImportResultRow(
  row: PatientImportPreviewRow,
  result: PatientImportRowResult["result"],
  reason = row.reason,
): PatientImportRowResult {
  return { ...row, result, reason };
}

function getResultStatusForPreview(
  row: PatientImportPreviewRow,
): PatientImportRowResult["result"] | null {
  if (row.classification === "INVALID") {
    return "INVALID";
  }

  if (row.classification === "DUPLICATE_IN_FILE") {
    return "DUPLICATE_IN_FILE";
  }

  if (row.classification === "CONFLICT") {
    return "CONFLICT";
  }

  return null;
}

export async function importPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientImportResultSummary> {
  const normalizedCandidates = normalizeImportCandidates(candidates, targetHospitalId);
  const preview = await previewPatientProvisioning(
    actor,
    targetHospitalId,
    normalizedCandidates,
    getDatabase(dependencies),
  );
  const rows: PatientImportRowResult[] = [];
  let imported = 0;
  let alreadyExists = 0;
  let duplicateInFile = 0;
  let invalid = 0;
  let conflict = 0;
  let failed = 0;

  for (const [index, candidate] of normalizedCandidates.entries()) {
    const previewRow = preview.rows[index];
    const previewResult = getResultStatusForPreview(previewRow);

    if (previewResult) {
      rows.push(toImportResultRow(previewRow, previewResult));
      if (previewResult === "DUPLICATE_IN_FILE") duplicateInFile += 1;
      if (previewResult === "INVALID") invalid += 1;
      if (previewResult === "CONFLICT") conflict += 1;
      continue;
    }

    if (!candidate.input) {
      rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ครบถ้วน"));
      invalid += 1;
      continue;
    }

    try {
      const result = await provisionPatientWithAuthorizationMode(
        actor,
        candidate.input,
        dependencies,
        "BULK",
      );

      if (result.outcome === "CREATED") {
        imported += 1;
        rows.push(toImportResultRow(previewRow, "IMPORTED", "บันทึกข้อมูลผู้ป่วยแล้ว"));
      } else {
        alreadyExists += 1;
        rows.push(toImportResultRow(previewRow, "ALREADY_EXISTS", "มีข้อมูลผู้ป่วยนี้แล้ว"));
      }
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      if (error instanceof ValidationError) {
        invalid += 1;
        rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ถูกต้อง"));
        continue;
      }

      if (error instanceof ConflictError) {
        conflict += 1;
        rows.push(toImportResultRow(previewRow, "CONFLICT", "ข้อมูลขัดแย้ง ต้องตรวจสอบโดยผู้ดูแล"));
        continue;
      }

      failed += 1;
      rows.push(toImportResultRow(previewRow, "FAILED", "ระบบไม่สามารถบันทึกแถวนี้ได้"));
    }
  }

  return {
    targetHospitalId,
    imported,
    alreadyExists,
    duplicateInFile,
    invalid,
    conflict,
    failed,
    rows,
  };
}

export const patientProvisioningInternals = {
  assertReusableUser,
  classifyExistingPatient,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
};
