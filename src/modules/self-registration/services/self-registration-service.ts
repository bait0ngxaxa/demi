import "server-only";

import {
  PatientActivationPurpose,
  Prisma,
  WorkforceActivationMode,
  WorkforceActivationPurpose,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ProvisionPasswordAuthIdentityResult } from "@/modules/auth/services/password-auth-provisioning-service";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { maskPersonName } from "@/modules/workforce/services/activation-identity";
import {
  generateWorkforceActivationCredential,
  hashWorkforceActivationToken,
} from "@/modules/workforce/services/activation-token-service";
import { completeWorkforceSelfRegistration } from "@/modules/workforce/services/workforce-service";
import {
  generatePatientActivationCredential,
  hashPatientActivationToken,
} from "@/modules/patient-activation/services/activation-token-service";
import { completePatientSelfRegistration } from "@/modules/patient-activation/services/patient-activation-service";
import { ConflictError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import {
  SELF_REGISTRATION_CAPABILITY_TTL_MS,
  selfRegistrationCompletionSchema,
  selfRegistrationLookupSchema,
  type SelfRegistrationOutcome,
  type SelfRegistrationRelationship,
} from "../domain/self-registration-schemas";
import { evaluateSelfRegistrationByIdentityHash } from "./self-registration-eligibility";
import {
  createPublicSelfRegistrationRateLimiter,
  type PublicSelfRegistrationRateLimiter,
} from "./public-self-registration-rate-limit";

export const SELF_REGISTRATION_NOT_FOUND_MESSAGE =
  "ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ";
export const SELF_REGISTRATION_ALREADY_ACTIVE_MESSAGE = "บัญชีนี้เปิดใช้งานแล้ว";
export const SELF_REGISTRATION_RETRY_MESSAGE = "ลองใหม่ภายหลัง";
const SELF_REGISTRATION_CAPABILITY_ISSUED_ACTION = "self_registration.capability_issued";

export class SelfRegistrationRateLimitedError extends Error {
  constructor() {
    super(SELF_REGISTRATION_RETRY_MESSAGE);
    this.name = "SelfRegistrationRateLimitedError";
  }
}

export type SelfRegistrationServiceDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  rateLimiter?: PublicSelfRegistrationRateLimiter;
  provisionIdentity?: (input: { userId: string; password: string }) => Promise<ProvisionPasswordAuthIdentityResult>;
};

function getDatabase(dependencies: SelfRegistrationServiceDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: SelfRegistrationServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function runSerializable<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isSerializationConflict(error) || retries >= 2) throw error;
      retries += 1;
    }
  }
}

async function consumeLookupLimits(
  nationalIdHash: string,
  ipAddress: string,
  now: Date,
  dependencies: SelfRegistrationServiceDependencies,
): Promise<void> {
  const rateLimiter = dependencies.rateLimiter ?? createPublicSelfRegistrationRateLimiter();
  if (!await rateLimiter.consume("IP", ipAddress, now)) throw new SelfRegistrationRateLimitedError();
  if (!await rateLimiter.consume("GLOBAL", "GLOBAL", now)) throw new SelfRegistrationRateLimitedError();
  if (!await rateLimiter.consume("IDENTITY", nationalIdHash, now)) throw new SelfRegistrationRateLimitedError();
}

function capabilityPurpose(relationships: readonly SelfRegistrationRelationship[]): "WORKFORCE" | "PATIENT" {
  return relationships.some(({ kind }) => kind !== "PATIENT") ? "WORKFORCE" : "PATIENT";
}

async function issueCapability(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    relationships: SelfRegistrationRelationship[];
    now: Date;
    expiresAt: Date;
  },
): Promise<string> {
  const purpose = capabilityPurpose(input.relationships);
  if (purpose === "WORKFORCE") {
    const credential = generateWorkforceActivationCredential();
    await transaction.workforceActivation.updateMany({
      where: {
        userId: input.userId,
        purpose: WorkforceActivationPurpose.SELF_REGISTRATION,
        usedAt: null,
        revokedAt: null,
        claimedAt: null,
      },
      data: { revokedAt: input.now },
    });
    await transaction.workforceActivation.create({
      data: {
        userId: input.userId,
        createdByUserId: input.userId,
        tokenHash: credential.tokenHash,
        mode: WorkforceActivationMode.REMOTE,
        purpose: WorkforceActivationPurpose.SELF_REGISTRATION,
        expiresAt: input.expiresAt,
        selfRegistrationRelationships: input.relationships,
      },
    });
    return credential.plaintextToken;
  }

  const credential = generatePatientActivationCredential();
  const firstRelationship = input.relationships[0];
  if (!firstRelationship || firstRelationship.kind !== "PATIENT") {
    throw new ConflictError("Patient self-registration context is invalid");
  }
  await transaction.patientActivation.updateMany({
    where: {
      userId: input.userId,
      purpose: PatientActivationPurpose.SELF_REGISTRATION,
      usedAt: null,
      revokedAt: null,
      claimedAt: null,
    },
    data: { revokedAt: input.now },
  });
  await transaction.patientActivation.create({
    data: {
      userId: input.userId,
      createdByUserId: input.userId,
      hospitalId: firstRelationship.hospitalId,
      tokenHash: credential.tokenHash,
      purpose: PatientActivationPurpose.SELF_REGISTRATION,
      expiresAt: input.expiresAt,
      selfRegistrationRelationships: input.relationships,
    },
  });
  return credential.plaintextToken;
}

export async function lookupPublicSelfRegistration(
  input: unknown,
  context: { ipAddress: string },
  dependencies: SelfRegistrationServiceDependencies = {},
): Promise<SelfRegistrationOutcome> {
  const parsed = selfRegistrationLookupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Self-registration lookup data is invalid");
  if (!context.ipAddress || context.ipAddress.length > 64) {
    throw new InfrastructureError("Self-registration client address is unavailable");
  }

  const now = getNow(dependencies);
  const identityKeyHash = hashIdentityReference({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: parsed.data.nationalId,
  });
  await consumeLookupLimits(identityKeyHash, context.ipAddress, now, dependencies);

  try {
    return await runSerializable(getDatabase(dependencies), async (transaction) => {
      const person = await transaction.person.findUnique({
        where: { identityKeyHash },
        select: { user: { select: { id: true } } },
      });
      const userId = person?.user?.id;
      if (!userId) {
        return { outcome: "NOT_FOUND", message: SELF_REGISTRATION_NOT_FOUND_MESSAGE };
      }

      await lockFirstCredentialOperation(transaction, userId);
      const eligibility = await evaluateSelfRegistrationByIdentityHash(transaction, identityKeyHash, now);
      if (eligibility.outcome === "NOT_FOUND") {
        return { outcome: "NOT_FOUND", message: SELF_REGISTRATION_NOT_FOUND_MESSAGE };
      }
      if (eligibility.outcome === "ALREADY_ACTIVE") {
        return { outcome: "ALREADY_ACTIVE", message: SELF_REGISTRATION_ALREADY_ACTIVE_MESSAGE };
      }

      const expiresAt = new Date(now.getTime() + SELF_REGISTRATION_CAPABILITY_TTL_MS);
      const capability = await issueCapability(transaction, {
        userId: eligibility.userId,
        relationships: eligibility.relationships,
        now,
        expiresAt,
      });
      await recordAuditEvent({
        actorUserId: null,
        action: SELF_REGISTRATION_CAPABILITY_ISSUED_ACTION,
        resourceType: "SelfRegistration",
        metadata: {
          purpose: capabilityPurpose(eligibility.relationships),
          relationshipCount: eligibility.relationships.length,
        },
      }, transaction);

      return {
        outcome: "FOUND",
        capability,
        maskedName: maskPersonName(eligibility.givenName, eligibility.familyName),
      };
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof InfrastructureError) {
      throw error;
    }
    throw new InfrastructureError("Self-registration lookup could not be completed");
  }
}

export async function completePublicSelfRegistration(
  input: unknown,
  dependencies: SelfRegistrationServiceDependencies = {},
): Promise<{ userId: string }> {
  const parsed = selfRegistrationCompletionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Self-registration completion data is invalid");
  if (!parsed.data.nameConfirmed) throw new ValidationError("Self-registration identity confirmation is required");

  const database = getDatabase(dependencies);
  const workforceHash = hashWorkforceActivationToken(parsed.data.token);
  const patientHash = hashPatientActivationToken(parsed.data.token);
  try {
    const [workforceActivation, patientActivation] = await Promise.all([
      database.workforceActivation.findUnique({
        where: { tokenHash: workforceHash },
        select: { purpose: true },
      }),
      database.patientActivation.findUnique({
        where: { tokenHash: patientHash },
        select: { purpose: true },
      }),
    ]);
    const isWorkforceSelfRegistration = workforceActivation?.purpose === WorkforceActivationPurpose.SELF_REGISTRATION;
    const isPatientSelfRegistration = patientActivation?.purpose === PatientActivationPurpose.SELF_REGISTRATION;
    if (isWorkforceSelfRegistration === isPatientSelfRegistration) {
      throw new ConflictError("Self-registration capability is invalid");
    }
    if (isWorkforceSelfRegistration) {
      return await completeWorkforceSelfRegistration(parsed.data.token, {
        nationalId: parsed.data.nationalId,
        password: parsed.data.password,
        passwordConfirmation: parsed.data.passwordConfirmation,
      }, dependencies);
    }
    return await completePatientSelfRegistration(parsed.data.token, {
      nationalId: parsed.data.nationalId,
      password: parsed.data.password,
      passwordConfirmation: parsed.data.passwordConfirmation,
    }, dependencies);
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof InfrastructureError) {
      throw error;
    }
    throw new InfrastructureError("Self-registration could not be completed");
  }
}
