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

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import {
  PasswordAuthProvisioningReconciliationError,
  provisionPasswordAuthIdentity,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  canIssuePatientActivation,
  decidePatientActivationIssuePolicy,
  PATIENT_ACTIVATION_ISSUE_CAPABILITY,
  type PatientActivationIssueTarget,
} from "../policies/patient-activation-policy";
import {
  patientActivationCompletionSchema,
  patientActivationRequestSchema,
  patientActivationTokenSchema,
  type PatientActivationCompletionInput,
  type PatientActivationRequestInput,
} from "../schemas/patient-activation-schemas";
import {
  generatePatientActivationCredential,
  getPatientActivationClaimExpiry,
  getPatientActivationExpiry,
  hashPatientActivationToken,
  type PatientActivationCredentialGenerator,
} from "./activation-token-service";

export type PatientActivationDatabase = PrismaClient;
export type PatientActivationAuthorizationDatabase =
  | Pick<PrismaClient, "user" | "hospitalMembership">
  | Prisma.TransactionClient;

export type PatientActivationServiceDependencies = {
  database?: PatientActivationDatabase;
  now?: () => Date;
  generateCredential?: PatientActivationCredentialGenerator;
  provisionIdentity?: (input: {
    userId: string;
    password: string;
  }) => Promise<ProvisionPasswordAuthIdentityResult>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  detachAuthSubject?: (input: { userId: string; authSubject: string }) => Promise<boolean>;
  transactionRetries?: number;
};

export type PatientActivationIssueOutcome =
  | "ISSUED"
  | "ALREADY_ISSUED"
  | "ALREADY_ACTIVE"
  | "RECONCILIATION_REQUIRED";

export type PatientActivationIssueResult = {
  outcome: PatientActivationIssueOutcome;
  userId: string;
  patientProfileId: string | null;
  hospitalId: string;
  activationToken: string | null;
  activationExpiresAt: Date | null;
};

export type PatientActivationDetails = {
  displayName: string;
  hospitalName: string;
  activationExpiresAt: Date;
};

type PatientActivationClaim = {
  activationId: string;
  userId: string;
  hospitalId: string;
  claimedAt: Date;
  claimExpiresAt: Date;
};

type PatientActivationTargetRecord = {
  id: string;
  status: UserStatus;
  authSubject: string | null;
  patientProfileId: string | null;
  hasPatientRole: boolean;
  hasHospitalRelationship: boolean;
  givenName: string | null;
  familyName: string | null;
};

const DEFAULT_TRANSACTION_RETRIES = 2;
const GENERIC_ACTIVATION_ERROR = "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ";

export class PatientActivationReconciliationError extends InfrastructureError {
  readonly requiresReconciliation = true;

  constructor() {
    super("Patient activation requires provider reconciliation");
    this.name = "PatientActivationReconciliationError";
  }
}

function getDatabase(dependencies: PatientActivationServiceDependencies): PatientActivationDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientActivationServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The patient activation state conflicts with existing data");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The patient activation operation conflicted with another request");
  }

  return new InfrastructureError(fallbackMessage);
}

async function runSerializable<T>(
  database: PatientActivationDatabase,
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

export function isProviderSubject(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function hasActiveClaim(
  activation: Pick<CurrentPatientActivation, "claimedAt" | "claimExpiresAt" | "reconciliationRequiredAt" | "usedAt" | "revokedAt">,
  now: Date,
): boolean {
  return Boolean(
    activation.claimedAt &&
      activation.claimExpiresAt &&
      activation.claimExpiresAt > now &&
      !activation.reconciliationRequiredAt &&
      !activation.usedAt &&
      !activation.revokedAt,
  );
}

function hasStaleClaim(
  activation: Pick<CurrentPatientActivation, "claimedAt" | "claimExpiresAt" | "reconciliationRequiredAt" | "usedAt" | "revokedAt">,
  now: Date,
): boolean {
  return Boolean(
    activation.claimedAt &&
      (!activation.claimExpiresAt || activation.claimExpiresAt <= now) &&
      !activation.reconciliationRequiredAt &&
      !activation.usedAt &&
      !activation.revokedAt,
  );
}

function toPatientActivationTarget(
  user: PatientActivationTargetRecord,
): PatientActivationIssueTarget {
  return {
    status: user.status,
    authSubject: user.authSubject,
    hasPatientRole: user.hasPatientRole,
    hasPatientProfile: Boolean(user.patientProfileId),
    hasHospitalRelationship: user.hasHospitalRelationship,
  };
}

function assertIssuePolicy(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): void {
  const decision = decidePatientActivationIssuePolicy({
    actor,
    capability: PATIENT_ACTIVATION_ISSUE_CAPABILITY,
    targetHospitalId,
  });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export async function assertPatientActivationActorInDatabase(
  transaction: PatientActivationAuthorizationDatabase,
  actorUserId: string,
  targetHospitalId: string,
): Promise<void> {
  await assertPatientActivationActorIdentityInDatabase(transaction, actorUserId);

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId: targetHospitalId,
      membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ForbiddenError();
  }
}

export async function assertPatientActivationActorIdentityInDatabase(
  transaction: PatientActivationAuthorizationDatabase,
  actorUserId: string,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    !actor ||
    actor.status !== UserStatus.ACTIVE ||
    !actor.roles.some(({ role }) => role === Role.HOSPITAL)
  ) {
    throw new ForbiddenError();
  }
}

async function findPatientActivationTarget(
  transaction: Prisma.TransactionClient,
  userId: string,
  hospitalId: string,
): Promise<PatientActivationTargetRecord | null> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      authSubject: true,
      roles: {
        where: { role: Role.PATIENT },
        select: { role: true },
      },
      person: {
        select: {
          givenName: true,
          familyName: true,
          patientProfile: {
            select: {
              id: true,
              hospitalRelationships: {
                where: { hospitalId },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    status: user.status,
    authSubject: user.authSubject,
    patientProfileId: user.person.patientProfile?.id ?? null,
    hasPatientRole: user.roles.length === 1,
    hasHospitalRelationship:
      (user.person.patientProfile?.hospitalRelationships.length ?? 0) === 1,
    givenName: user.person.givenName,
    familyName: user.person.familyName,
  };
}

function assertPatientActivationEligibility(
  target: PatientActivationTargetRecord | null,
): PatientActivationTargetRecord {
  if (!target) {
    throw new NotFoundError("The Patient account was not found");
  }

  if (
    !target.hasPatientRole ||
    !target.patientProfileId ||
    !target.hasHospitalRelationship
  ) {
    throw new ConflictError("The Patient account is missing required domain state");
  }

  if (target.status === UserStatus.ACTIVE && isProviderSubject(target.authSubject ?? "")) {
    return target;
  }

  if (target.status === UserStatus.PROVISIONED && target.authSubject === null) {
    return target;
  }

  if (target.status === UserStatus.PROVISIONED && isProviderSubject(target.authSubject ?? "")) {
    return target;
  }

  throw new ConflictError("The Patient account requires reconciliation before activation");
}

type CurrentPatientActivation = {
  id: string;
  userId: string;
  hospitalId: string;
  expiresAt: Date;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  reconciliationRequiredAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
};

async function findCurrentPatientActivation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<CurrentPatientActivation | null> {
  return transaction.patientActivation.findFirst({
    where: {
      userId,
      usedAt: null,
      revokedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      userId: true,
      hospitalId: true,
      expiresAt: true,
      claimedAt: true,
      claimExpiresAt: true,
      reconciliationRequiredAt: true,
      usedAt: true,
      revokedAt: true,
    },
  });
}

type ClaimStateResolution = "AVAILABLE" | "ACTIVE" | "RECOVERED" | "RECONCILIATION_REQUIRED";

async function resolveClaimStateInTransaction(
  transaction: Prisma.TransactionClient,
  activation: CurrentPatientActivation,
  target: PatientActivationTargetRecord,
  now: Date,
  actorUserId: string | null,
): Promise<ClaimStateResolution> {
  if (activation.reconciliationRequiredAt) {
    return "RECONCILIATION_REQUIRED";
  }

  if (activation.claimedAt && target.authSubject !== null) {
    const marked = await transaction.patientActivation.updateMany({
      where: {
        id: activation.id,
        userId: activation.userId,
        claimedAt: activation.claimedAt,
        usedAt: null,
        revokedAt: null,
        reconciliationRequiredAt: null,
      },
      data: {
        reconciliationRequiredAt: now,
        claimExpiresAt: null,
      },
    });

    if (marked.count !== 1) {
      return "RECONCILIATION_REQUIRED";
    }

    await recordAuditEvent(
      {
        actorUserId,
        action: "patient_activation.reconciliation_required",
        resourceType: "PatientActivation",
        resourceId: activation.id,
        metadata: {
          hospitalId: activation.hospitalId,
          reason: "claim_has_local_auth_mapping",
        },
      },
      transaction,
    );

    return "RECONCILIATION_REQUIRED";
  }

  if (hasActiveClaim(activation, now)) {
    return "ACTIVE";
  }

  if (!hasStaleClaim(activation, now)) {
    return "AVAILABLE";
  }

  const locallyClean =
    target.status === UserStatus.PROVISIONED && target.authSubject === null;

  if (locallyClean) {
    const released = await transaction.patientActivation.updateMany({
      where: {
        id: activation.id,
        userId: activation.userId,
        claimedAt: activation.claimedAt,
        usedAt: null,
        revokedAt: null,
        reconciliationRequiredAt: null,
      },
      data: {
        claimedAt: null,
        claimExpiresAt: null,
      },
    });

    if (released.count !== 1) {
      return "RECONCILIATION_REQUIRED";
    }

    await recordAuditEvent(
      {
        actorUserId,
        action: "patient_activation.stale_claim_released",
        resourceType: "PatientActivation",
        resourceId: activation.id,
        metadata: {
          hospitalId: activation.hospitalId,
          reason: "expired_claim_lease",
        },
      },
      transaction,
    );

    return "RECOVERED";
  }

  const marked = await transaction.patientActivation.updateMany({
    where: {
      id: activation.id,
      userId: activation.userId,
      claimedAt: activation.claimedAt,
      usedAt: null,
      revokedAt: null,
      reconciliationRequiredAt: null,
    },
    data: {
      reconciliationRequiredAt: now,
      claimExpiresAt: null,
    },
  });

  if (marked.count !== 1) {
    return "RECONCILIATION_REQUIRED";
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "patient_activation.reconciliation_required",
      resourceType: "PatientActivation",
      resourceId: activation.id,
      metadata: {
        hospitalId: activation.hospitalId,
        reason: "stale_claim_has_local_auth_mapping",
      },
    },
    transaction,
  );

  return "RECONCILIATION_REQUIRED";
}

async function revokePatientActivationInTransaction(
  transaction: Prisma.TransactionClient,
  activation: CurrentPatientActivation,
  actorUserId: string,
  now: Date,
  source: "explicit_reissue" | "expired_reissue",
): Promise<void> {
  if (activation.reconciliationRequiredAt || activation.claimedAt) {
    throw new ConflictError("The Patient activation credential is currently being used");
  }

  const revoked = await transaction.patientActivation.updateMany({
    where: {
      id: activation.id,
      userId: activation.userId,
      claimedAt: null,
      usedAt: null,
      revokedAt: null,
      reconciliationRequiredAt: null,
    },
    data: {
      revokedAt: now,
      claimExpiresAt: null,
    },
  });

  if (revoked.count !== 1) {
    throw new ConflictError("The Patient activation credential changed during reissue");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "patient_activation.revoked",
      resourceType: "PatientActivation",
      resourceId: activation.id,
      metadata: { source },
    },
    transaction,
  );
}

async function issuePatientActivationInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    request: PatientActivationRequestInput;
    target: PatientActivationTargetRecord;
    now: Date;
    dependencies: PatientActivationServiceDependencies;
  },
): Promise<PatientActivationIssueResult> {
  if (input.target.status === UserStatus.ACTIVE) {
    return {
      outcome: "ALREADY_ACTIVE",
      userId: input.target.id,
      patientProfileId: input.target.patientProfileId,
      hospitalId: input.request.targetHospitalId,
      activationToken: null,
      activationExpiresAt: null,
    };
  }

  let current = await findCurrentPatientActivation(transaction, input.target.id);

  if (current) {
    const claimState = await resolveClaimStateInTransaction(
      transaction,
      current,
      input.target,
      input.now,
      input.actorUserId,
    );

    if (claimState === "RECONCILIATION_REQUIRED") {
      return {
        outcome: "RECONCILIATION_REQUIRED",
        userId: input.target.id,
        patientProfileId: input.target.patientProfileId,
        hospitalId: input.request.targetHospitalId,
        activationToken: null,
        activationExpiresAt: current.expiresAt,
      };
    }

    if (claimState === "ACTIVE") {
      throw new ConflictError("The Patient activation credential is currently being used");
    }

    if (claimState === "RECOVERED") {
      current = {
        ...current,
        claimedAt: null,
        claimExpiresAt: null,
      };
    }
  }

  if (input.target.status === UserStatus.PROVISIONED && input.target.authSubject !== null) {
    return {
      outcome: "RECONCILIATION_REQUIRED",
      userId: input.target.id,
      patientProfileId: input.target.patientProfileId,
      hospitalId: input.request.targetHospitalId,
      activationToken: null,
      activationExpiresAt: current?.expiresAt ?? null,
    };
  }

  if (current && current.expiresAt > input.now && !input.request.reissue) {
    return {
      outcome: "ALREADY_ISSUED",
      userId: input.target.id,
      patientProfileId: input.target.patientProfileId,
      hospitalId: input.request.targetHospitalId,
      activationToken: null,
      activationExpiresAt: current.expiresAt,
    };
  }

  if (current) {
    await revokePatientActivationInTransaction(
      transaction,
      current,
      input.actorUserId,
      input.now,
      current.expiresAt <= input.now ? "expired_reissue" : "explicit_reissue",
    );
  }

  const credential = (input.dependencies.generateCredential ??
    generatePatientActivationCredential)();
  const expiresAt = getPatientActivationExpiry(input.now);
  const activation = await transaction.patientActivation.create({
    data: {
      userId: input.target.id,
      hospitalId: input.request.targetHospitalId,
      tokenHash: credential.tokenHash,
      expiresAt,
      createdByUserId: input.actorUserId,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: "patient_activation.issued",
      resourceType: "PatientActivation",
      resourceId: activation.id,
      metadata: {
        hospitalId: input.request.targetHospitalId,
        reissued: Boolean(current),
        status: UserStatus.PROVISIONED,
      },
    },
    transaction,
  );

  return {
    outcome: "ISSUED",
    userId: input.target.id,
    patientProfileId: input.target.patientProfileId,
    hospitalId: input.request.targetHospitalId,
    activationToken: credential.plaintextToken,
    activationExpiresAt: expiresAt,
  };
}

export async function issuePatientActivation(
  actor: ActorContext | null | undefined,
  input: PatientActivationRequestInput,
  dependencies: PatientActivationServiceDependencies = {},
): Promise<PatientActivationIssueResult> {
  const parsed = patientActivationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient activation request is invalid");
  }

  assertIssuePolicy(actor, parsed.data.targetHospitalId);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertPatientActivationActorInDatabase(
          transaction,
          actor.userId,
          parsed.data.targetHospitalId,
        );

        const target = assertPatientActivationEligibility(
          await findPatientActivationTarget(
            transaction,
            parsed.data.userId,
            parsed.data.targetHospitalId,
          ),
        );

        const canIssue = canIssuePatientActivation(
          actor,
          toPatientActivationTarget(target),
          parsed.data.targetHospitalId,
        );
        const hasAmbiguousProvisionedMapping =
          target.status === UserStatus.PROVISIONED &&
          isProviderSubject(target.authSubject ?? "") &&
          target.hasPatientRole &&
          Boolean(target.patientProfileId) &&
          target.hasHospitalRelationship;

        if (!canIssue && !hasAmbiguousProvisionedMapping) {
          throw new ConflictError("The Patient account is not eligible for activation issuance");
        }

        return issuePatientActivationInTransaction(transaction, {
          actorUserId: actor.userId,
          request: parsed.data,
          target,
          now: getNow(dependencies),
          dependencies,
        });
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Patient activation could not be issued");
  }
}

function assertUsablePatientActivationState(input: {
  activation: {
    expiresAt: Date;
    claimedAt: Date | null;
    claimExpiresAt: Date | null;
    reconciliationRequiredAt: Date | null;
    usedAt: Date | null;
    revokedAt: Date | null;
  };
  target: PatientActivationTargetRecord | null;
  hospitalStatus: HospitalStatus;
  now: Date;
}): PatientActivationTargetRecord {
  if (
    input.activation.usedAt ||
    input.activation.revokedAt ||
    input.activation.reconciliationRequiredAt ||
    input.activation.expiresAt <= input.now ||
    input.hospitalStatus !== HospitalStatus.ACTIVE
  ) {
    throw new ConflictError(GENERIC_ACTIVATION_ERROR);
  }

  const target = input.target;

  if (!target) {
    throw new ConflictError(GENERIC_ACTIVATION_ERROR);
  }

  if (
    target.status !== UserStatus.PROVISIONED ||
    target.authSubject !== null ||
    !target.hasPatientRole ||
    !target.patientProfileId ||
    !target.hasHospitalRelationship
  ) {
    throw new ConflictError(GENERIC_ACTIVATION_ERROR);
  }

  return target;
}

export async function getPatientActivationDetails(
  token: string,
  dependencies: PatientActivationServiceDependencies = {},
): Promise<PatientActivationDetails> {
  const parsedToken = patientActivationTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    throw new ValidationError(GENERIC_ACTIVATION_ERROR);
  }

  const tokenHash = hashPatientActivationToken(parsedToken.data);
  const now = getNow(dependencies);

  try {
    const activation = await getDatabase(dependencies).patientActivation.findUnique({
      where: { tokenHash },
      select: {
        hospitalId: true,
        expiresAt: true,
        claimedAt: true,
        claimExpiresAt: true,
        reconciliationRequiredAt: true,
        usedAt: true,
        revokedAt: true,
        hospital: { select: { name: true, status: true } },
        user: {
          select: {
            id: true,
            status: true,
            authSubject: true,
            roles: { where: { role: Role.PATIENT }, select: { role: true } },
            person: {
              select: {
                givenName: true,
                familyName: true,
                patientProfile: {
                  select: {
                    id: true,
                    hospitalRelationships: {
                      select: { hospitalId: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!activation) {
      throw new ConflictError(GENERIC_ACTIVATION_ERROR);
    }

    const target = {
      id: activation.user.id,
      status: activation.user.status,
      authSubject: activation.user.authSubject,
      patientProfileId: activation.user.person.patientProfile?.id ?? null,
      hasPatientRole: activation.user.roles.length === 1,
      hasHospitalRelationship: Boolean(
        activation.user.person.patientProfile?.hospitalRelationships.some(
          ({ hospitalId }) => hospitalId === activation.hospitalId,
        ),
      ),
      givenName: activation.user.person.givenName,
      familyName: activation.user.person.familyName,
    };

    const eligibleTarget = assertUsablePatientActivationState({
      activation,
      target,
      hospitalStatus: activation.hospital.status,
      now,
    });

    const displayName = [eligibleTarget.givenName, eligibleTarget.familyName]
      .filter((value): value is string => Boolean(value))
      .join(" ") || "ผู้ป่วย";

    return {
      displayName,
      hospitalName: activation.hospital.name,
      activationExpiresAt: activation.expiresAt,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient activation details could not be loaded");
  }
}

async function claimPatientActivation(
  token: string,
  dependencies: PatientActivationServiceDependencies,
): Promise<PatientActivationClaim> {
  const tokenHash = hashPatientActivationToken(token);
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    const result = await runSerializable<
      | { kind: "CLAIM"; claim: PatientActivationClaim }
      | { kind: "RECONCILIATION_REQUIRED" }
    >(
      database,
      async (transaction) => {
        const activation = await transaction.patientActivation.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            userId: true,
            hospitalId: true,
            expiresAt: true,
            claimedAt: true,
            claimExpiresAt: true,
            reconciliationRequiredAt: true,
            usedAt: true,
            revokedAt: true,
            hospital: { select: { status: true } },
          },
        });

        const target = activation
          ? await findPatientActivationTarget(
              transaction,
              activation.userId,
              activation.hospitalId,
            )
          : null;

        if (!activation || !target || activation.usedAt || activation.revokedAt) {
          throw new ConflictError(GENERIC_ACTIVATION_ERROR);
        }

        if (
          activation.expiresAt <= now ||
          activation.hospital.status !== HospitalStatus.ACTIVE ||
          target.status !== UserStatus.PROVISIONED ||
          !target.hasPatientRole ||
          !target.patientProfileId ||
          !target.hasHospitalRelationship
        ) {
          throw new ConflictError(GENERIC_ACTIVATION_ERROR);
        }

        const current: CurrentPatientActivation = {
          id: activation.id,
          userId: activation.userId,
          hospitalId: activation.hospitalId,
          expiresAt: activation.expiresAt,
          claimedAt: activation.claimedAt,
          claimExpiresAt: activation.claimExpiresAt,
          reconciliationRequiredAt: activation.reconciliationRequiredAt,
          usedAt: activation.usedAt,
          revokedAt: activation.revokedAt,
        };
        const claimState = await resolveClaimStateInTransaction(
          transaction,
          current,
          target,
          now,
          null,
        );

        if (claimState === "RECONCILIATION_REQUIRED") {
          return { kind: "RECONCILIATION_REQUIRED" };
        }

        if (claimState === "ACTIVE") {
          throw new ConflictError(GENERIC_ACTIVATION_ERROR);
        }

        if (target.authSubject !== null) {
          throw new ConflictError(GENERIC_ACTIVATION_ERROR);
        }

        const claimed = await transaction.patientActivation.updateMany({
          where: {
            id: activation.id,
            tokenHash,
            claimedAt: null,
            claimExpiresAt: null,
            reconciliationRequiredAt: null,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            claimedAt: now,
            claimExpiresAt: getPatientActivationClaimExpiry(now),
          },
        });

        if (claimed.count !== 1) {
          throw new ConflictError(GENERIC_ACTIVATION_ERROR);
        }

        return {
          kind: "CLAIM",
          claim: {
            activationId: activation.id,
            userId: activation.userId,
            hospitalId: activation.hospitalId,
            claimedAt: now,
            claimExpiresAt: getPatientActivationClaimExpiry(now),
          },
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    if (result.kind === "RECONCILIATION_REQUIRED") {
      throw new PatientActivationReconciliationError();
    }

    return result.claim;
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      throw error;
    }

    throw normalizeDatabaseError(error, "Patient activation could not be claimed");
  }
}

async function releasePatientActivationClaim(
  claim: PatientActivationClaim,
  dependencies: PatientActivationServiceDependencies,
): Promise<void> {
  const database = getDatabase(dependencies);

  try {
    const result = await database.patientActivation.updateMany({
      where: {
        id: claim.activationId,
        userId: claim.userId,
        hospitalId: claim.hospitalId,
        claimedAt: claim.claimedAt,
        claimExpiresAt: claim.claimExpiresAt,
        reconciliationRequiredAt: null,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        claimedAt: null,
        claimExpiresAt: null,
      },
    });

    if (result.count !== 1) {
      await markPatientActivationReconciliationRequired(
        claim,
        dependencies,
        "claim_release_conflict",
      );
      throw new PatientActivationReconciliationError();
    }
  } catch (error: unknown) {
    if (error instanceof PatientActivationReconciliationError) {
      throw error;
    }

    try {
      await markPatientActivationReconciliationRequired(
        claim,
        dependencies,
        "claim_release_failure",
      );
    } catch {
      // The reconciliation error below is the safe outcome even when the
      // marker itself cannot be persisted because the database is unavailable.
    }

    throw new PatientActivationReconciliationError();
  }
}

async function markPatientActivationReconciliationRequired(
  claim: PatientActivationClaim,
  dependencies: PatientActivationServiceDependencies,
  reason: "provider_ambiguous" | "claim_release_conflict" | "claim_release_failure" | "local_finalize_ambiguous",
): Promise<void> {
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    const marked = await database.patientActivation.updateMany({
      where: {
        id: claim.activationId,
        userId: claim.userId,
        hospitalId: claim.hospitalId,
        usedAt: null,
        revokedAt: null,
        reconciliationRequiredAt: null,
      },
      data: {
        reconciliationRequiredAt: now,
        claimExpiresAt: null,
      },
    });

    if (marked.count === 1) {
      await recordAuditEvent({
        actorUserId: null,
        action: "patient_activation.reconciliation_required",
        resourceType: "PatientActivation",
        resourceId: claim.activationId,
        metadata: {
          hospitalId: claim.hospitalId,
          reason,
        },
      }, database);
      return;
    }

    const existing = await database.patientActivation.findUnique({
      where: { id: claim.activationId },
      select: { reconciliationRequiredAt: true },
    });

    if (existing?.reconciliationRequiredAt) {
      return;
    }

    throw new Error("Patient activation reconciliation marker could not be written");
  } catch {
    throw new PatientActivationReconciliationError();
  }
}

async function finalizePatientActivationLocally(
  claim: PatientActivationClaim,
  authSubject: string,
  dependencies: PatientActivationServiceDependencies,
): Promise<void> {
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  await runSerializable(
    database,
    async (transaction) => {
      const activation = await transaction.patientActivation.findUnique({
        where: { id: claim.activationId },
        select: {
          id: true,
          userId: true,
          hospitalId: true,
          expiresAt: true,
          claimedAt: true,
          claimExpiresAt: true,
          reconciliationRequiredAt: true,
          usedAt: true,
          revokedAt: true,
          hospital: { select: { status: true } },
        },
      });
      const target = activation
        ? await findPatientActivationTarget(transaction, claim.userId, activation.hospitalId)
        : null;

      if (
        !activation ||
        activation.userId !== claim.userId ||
        activation.hospitalId !== claim.hospitalId ||
        activation.claimedAt?.getTime() !== claim.claimedAt.getTime() ||
        activation.claimExpiresAt?.getTime() !== claim.claimExpiresAt.getTime() ||
        !activation.claimExpiresAt ||
        activation.claimExpiresAt <= now ||
        activation.reconciliationRequiredAt ||
        activation.expiresAt <= now ||
        activation.usedAt ||
        activation.revokedAt ||
        activation.hospital.status !== HospitalStatus.ACTIVE ||
        !target ||
        target.status !== UserStatus.PROVISIONED ||
        target.authSubject !== authSubject ||
        !target.hasPatientRole ||
        !target.patientProfileId ||
        !target.hasHospitalRelationship
      ) {
        throw new ConflictError("Patient activation state changed before completion");
      }

      const activatedUser = await transaction.user.updateMany({
        where: {
          id: claim.userId,
          status: UserStatus.PROVISIONED,
          authSubject,
        },
        data: { status: UserStatus.ACTIVE },
      });

      if (activatedUser.count !== 1) {
        throw new ConflictError("Patient account changed during activation");
      }

      const consumed = await transaction.patientActivation.updateMany({
        where: {
          id: claim.activationId,
          userId: claim.userId,
          hospitalId: claim.hospitalId,
          claimedAt: claim.claimedAt,
          claimExpiresAt: claim.claimExpiresAt,
          reconciliationRequiredAt: null,
          usedAt: null,
          revokedAt: null,
        },
        data: {
          usedAt: now,
          claimedAt: null,
          claimExpiresAt: null,
        },
      });

      if (consumed.count !== 1) {
        throw new ConflictError("Patient activation credential changed during completion");
      }

      await recordAuditEvent(
        {
          actorUserId: null,
          action: "patient_activation.completed",
          resourceType: "User",
          resourceId: claim.userId,
          metadata: {
            hospitalId: claim.hospitalId,
            patientProfileId: target.patientProfileId,
            source: "patient_activation",
            status: UserStatus.ACTIVE,
          },
        },
        transaction,
      );
    },
    dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
  );
}

async function deleteProviderIdentityByDefault(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new PatientActivationReconciliationError();
  }
}

async function detachAuthSubjectFromDatabase(
  database: PatientActivationDatabase,
  input: { userId: string; authSubject: string },
): Promise<boolean> {
  try {
    const result = await database.user.updateMany({
      where: {
        id: input.userId,
        authSubject: input.authSubject,
        status: UserStatus.PROVISIONED,
      },
      data: { authSubject: null },
    });

    return result.count === 1;
  } catch {
    throw new PatientActivationReconciliationError();
  }
}

async function compensateFailedPatientFinalization(
  claim: PatientActivationClaim,
  authSubject: string,
  dependencies: PatientActivationServiceDependencies,
): Promise<void> {
  const detachAuthSubject =
    dependencies.detachAuthSubject ??
    ((input: { userId: string; authSubject: string }) =>
      detachAuthSubjectFromDatabase(getDatabase(dependencies), input));
  const detached = await detachAuthSubject({ userId: claim.userId, authSubject });

  if (!detached) {
    throw new PatientActivationReconciliationError();
  }

  const deleteProviderIdentity =
    dependencies.deleteProviderIdentity ?? deleteProviderIdentityByDefault;
  await deleteProviderIdentity(authSubject);
}

export async function completePatientActivation(
  token: string,
  input: PatientActivationCompletionInput,
  dependencies: PatientActivationServiceDependencies = {},
): Promise<{ userId: string; hospitalId: string }> {
  const parsedToken = patientActivationTokenSchema.safeParse(token);
  const parsedInput = patientActivationCompletionSchema.safeParse(input);

  if (!parsedToken.success || !parsedInput.success) {
    throw new ValidationError("Patient activation data is invalid");
  }

  const claim = await claimPatientActivation(parsedToken.data, dependencies);
  const provisionIdentity = dependencies.provisionIdentity ?? provisionPasswordAuthIdentity;
  let provisionedIdentity: ProvisionPasswordAuthIdentityResult;

  try {
    provisionedIdentity = await provisionIdentity({
      userId: claim.userId,
      password: parsedInput.data.password,
    });
  } catch (error: unknown) {
    if (error instanceof PasswordAuthProvisioningReconciliationError) {
      await markPatientActivationReconciliationRequired(
        claim,
        dependencies,
        "provider_ambiguous",
      );
      throw new PatientActivationReconciliationError();
    }

    await releasePatientActivationClaim(claim, dependencies);

    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Authentication provider could not establish the account");
  }

  if (
    provisionedIdentity.userId !== claim.userId ||
    !isProviderSubject(provisionedIdentity.authSubject)
  ) {
    await markPatientActivationReconciliationRequired(
      claim,
      dependencies,
      "provider_ambiguous",
    );
    throw new PatientActivationReconciliationError();
  }

  try {
    await finalizePatientActivationLocally(claim, provisionedIdentity.authSubject, dependencies);
  } catch (error: unknown) {
    try {
      await compensateFailedPatientFinalization(
        claim,
        provisionedIdentity.authSubject,
        dependencies,
      );
      await releasePatientActivationClaim(claim, dependencies);
    } catch (compensationError: unknown) {
      try {
        await markPatientActivationReconciliationRequired(
          claim,
          dependencies,
          "local_finalize_ambiguous",
        );
      } catch {
        // The typed reconciliation error below is still the safe result when
        // the marker cannot be persisted because the database is unavailable.
      }

      if (compensationError instanceof PatientActivationReconciliationError) {
        throw compensationError;
      }

      throw new PatientActivationReconciliationError();
    }

    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient activation could not be finalized");
  }

  return { userId: claim.userId, hospitalId: claim.hospitalId };
}

export const patientActivationInternals = {
  assertPatientActivationEligibility,
  assertUsablePatientActivationState,
  isProviderSubject,
};
