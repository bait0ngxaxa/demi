import "server-only";

import type { LegalChannel } from "@prisma/client";
import { headers } from "next/headers";

import {
  CONSENT_DOCUMENT_KINDS,
  LEGAL_ACCEPTANCE_REQUIRED_MESSAGE,
  LEGAL_VERSION_CHANGED_MESSAGE,
  legalChannelFromUserAgent,
} from "../domain/legal-documents";
import { LEGAL_FORM_FIELDS, legalConsentFieldName } from "../domain/legal-form-fields";
import type { AccountCreationConsentsInput, LegalAcceptanceInput } from "../schemas/legal-schemas";
import { LegalAcceptanceRequiredError, LegalVersionConflictError } from "../services/legal-version-reader";

/** The informational channel of the current request (LIFF vs WEB); never read from the request body. */
export async function getRequestLegalChannel(): Promise<LegalChannel> {
  const requestHeaders = await headers();
  return legalChannelFromUserAgent(requestHeaders.get("user-agent"));
}

export function legalChannelFromRequest(request: Request): LegalChannel {
  return legalChannelFromUserAgent(request.headers.get("user-agent"));
}

function formString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The required checkbox plus the version pair rendered with it; an unchecked box yields no acceptance. */
export function readLegalAcceptanceFromForm(formData: FormData): LegalAcceptanceInput | undefined {
  if (formData.get(LEGAL_FORM_FIELDS.accept) !== "on") return undefined;
  const termsVersionId = formString(formData, LEGAL_FORM_FIELDS.termsVersionId);
  const privacyVersionId = formString(formData, LEGAL_FORM_FIELDS.privacyVersionId);
  return termsVersionId && privacyVersionId ? { termsVersionId, privacyVersionId } : undefined;
}

/** Only checked consent toggles are present; each carries the version shown next to it. */
export function readConsentsFromForm(formData: FormData): AccountCreationConsentsInput {
  return CONSENT_DOCUMENT_KINDS.flatMap((kind) => {
    const documentVersionId = formString(formData, legalConsentFieldName(kind));
    return documentVersionId ? [{ kind, documentVersionId }] : [];
  });
}

/** JSON route bodies: the server sets the channel; a client-supplied value is overwritten. */
export function withServerLegalChannel(body: unknown, channel: LegalChannel): unknown {
  return body && typeof body === "object" && !Array.isArray(body) ? { ...body, channel } : body;
}

export type LegalActionError = { code: "LEGAL_VERSION_CHANGED" | "LEGAL_ACCEPTANCE_REQUIRED"; message: string };

export function mapLegalVersionError(error: unknown): LegalActionError | null {
  if (error instanceof LegalVersionConflictError) {
    return { code: "LEGAL_VERSION_CHANGED", message: LEGAL_VERSION_CHANGED_MESSAGE };
  }
  return null;
}

export function legalAcceptanceRequiredError(): LegalActionError {
  return { code: "LEGAL_ACCEPTANCE_REQUIRED", message: LEGAL_ACCEPTANCE_REQUIRED_MESSAGE };
}

export function isLegalAcceptanceIssue(error: unknown): boolean {
  return error instanceof LegalAcceptanceRequiredError;
}
