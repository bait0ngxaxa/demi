import "server-only";

import { randomUUID } from "node:crypto";

import { ConsentDecision, Role, type LegalChannel, type Prisma } from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ValidationError } from "@/shared/errors/application-error";

import type { AccountCreationLegalSource } from "../domain/legal-documents";
import {
  accountCreationConsentsSchema,
  legalAcceptanceInputSchema,
  type AccountCreationConsentsInput,
  type LegalAcceptanceInput,
} from "../schemas/legal-schemas";
import {
  assertCurrentTermsPair,
  findCurrentLegalVersions,
  LegalAcceptanceRequiredError,
  LegalVersionConflictError,
  type LegalReadDatabase,
} from "./legal-version-reader";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

export const LEGAL_TERMS_ACCEPTED_ACTION = "legal.terms_accepted";
export const LEGAL_CONSENT_GIVEN_ACTION = "legal.consent_given";
export const LEGAL_CONSENT_WITHDRAWN_ACTION = "legal.consent_withdrawn";

export type AccountCreationLegalInput = {
  userId: string;
  acceptLegal: LegalAcceptanceInput;
  /** PATIENT flows only; anything else must pass an empty list. */
  consents: AccountCreationConsentsInput;
  source: AccountCreationLegalSource;
  /** NULL only for ADMIN_BOOTSTRAP (operator CLI). */
  channel: LegalChannel | null;
};

/**
 * Early, read-only check before any credential or provider side effect, so a stale or missing acceptance creates
 * nothing. The authoritative check runs again inside the completion transaction.
 */
export async function assertAccountCreationLegalIsCurrent(
  database: LegalReadDatabase,
  input: { acceptLegal: unknown; consents?: unknown },
): Promise<void> {
  const acceptLegal = legalAcceptanceInputSchema.safeParse(input.acceptLegal);
  const consents = accountCreationConsentsSchema.safeParse(input.consents ?? []);
  if (!acceptLegal.success || !consents.success) throw new LegalAcceptanceRequiredError();
  let current: Awaited<ReturnType<typeof findCurrentLegalVersions>>;
  try {
    current = await findCurrentLegalVersions(database);
  } catch (error: unknown) {
    throw toInfrastructureError("legal.assertAccountCreationLegalIsCurrent", error, "Legal documents could not be checked");
  }
  assertCurrentTermsPair(current, acceptLegal.data);
  for (const consent of consents.data) {
    if (current[consent.kind]?.id !== consent.documentVersionId) throw new LegalVersionConflictError();
  }
}

/**
 * LG-1 §3: writes the Terms + Privacy acceptance and the optional consents of a new account inside the caller's
 * completion transaction. Consents are only for a User who holds a PATIENT role (LG-D6); otherwise the step fails.
 */
export async function recordAccountCreationLegal(
  transaction: Prisma.TransactionClient,
  input: AccountCreationLegalInput,
): Promise<void> {
  const acceptLegal = legalAcceptanceInputSchema.safeParse(input.acceptLegal);
  const consents = accountCreationConsentsSchema.safeParse(input.consents);
  if (!acceptLegal.success || !consents.success) throw new LegalAcceptanceRequiredError();
  if ((input.channel === null) !== (input.source === "ADMIN_BOOTSTRAP")) {
    throw new ValidationError("Legal acceptance channel is invalid");
  }

  const current = await findCurrentLegalVersions(transaction);
  const { terms, privacy } = assertCurrentTermsPair(current, acceptLegal.data);
  const consentVersions = consents.data.map((consent) => {
    const version = current[consent.kind];
    if (!version || version.id !== consent.documentVersionId) throw new LegalVersionConflictError();
    return version;
  });

  if (consentVersions.length > 0) {
    const patientRole = await transaction.userRole.findUnique({
      where: { userId_role: { userId: input.userId, role: Role.PATIENT } },
      select: { userId: true },
    });
    if (!patientRole) throw new ValidationError("Consents are offered only to Patient accounts");
  }

  await transaction.legalAcceptance.create({
    data: {
      userId: input.userId,
      termsVersionId: terms.id,
      privacyVersionId: privacy.id,
      source: input.source,
      channel: input.channel,
    },
    select: { id: true },
  });
  await recordAuditEvent({
    actorUserId: input.userId,
    action: LEGAL_TERMS_ACCEPTED_ACTION,
    resourceType: "User",
    resourceId: input.userId,
    metadata: {
      source: input.source,
      channel: input.channel,
      termsVersionId: terms.id,
      termsVersionLabel: terms.versionLabel,
      privacyVersionId: privacy.id,
      privacyVersionLabel: privacy.versionLabel,
    },
  }, transaction);

  for (const version of consentVersions) {
    if (input.channel === null) throw new ValidationError("Consent channel is required");
    await transaction.consentEvent.create({
      data: {
        userId: input.userId,
        kind: version.kind,
        documentVersionId: version.id,
        decision: ConsentDecision.GIVEN,
        channel: input.channel,
        submissionNonce: randomUUID(),
      },
      select: { id: true },
    });
    await recordAuditEvent({
      actorUserId: input.userId,
      action: LEGAL_CONSENT_GIVEN_ACTION,
      resourceType: "User",
      resourceId: input.userId,
      metadata: {
        kind: version.kind,
        documentVersionId: version.id,
        versionLabel: version.versionLabel,
        source: input.source,
        channel: input.channel,
      },
    }, transaction);
  }
}
