import "server-only";

import type { ConsentDecision, LegalChannel } from "@prisma/client";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { ConsentDocumentKind } from "../domain/legal-documents";
import type { LegalVersionView } from "../domain/legal-views";
import { getMyLegalStatus, needsLegalReacceptance } from "../services/legal-service";
import { toLegalVersionView } from "./legal-page-context";

export type ConsentHistoryView = { id: string; decision: ConsentDecision; decidedAt: string; versionLabel: string; channel: LegalChannel };

export type ConsentStatusView = {
  kind: ConsentDocumentKind;
  current: LegalVersionView | null;
  state: "GIVEN" | "WITHDRAWN" | "NONE";
  decidedVersion: LegalVersionView | null;
  newVersionAvailable: boolean;
  history: ConsentHistoryView[];
};

export type LegalSettingsView = {
  terms: LegalVersionView | null;
  privacy: LegalVersionView | null;
  acceptance: { termsVersionLabel: string; privacyVersionLabel: string; acceptedAt: string } | null;
  needsAcceptance: boolean;
  consentsOffered: boolean;
  consents: ConsentStatusView[];
  /** Navigation only: the ADMIN pages re-check the persisted ADMIN role. */
  canManageDocuments: boolean;
};

export async function getLegalSettingsView(): Promise<LegalSettingsView> {
  const actor = await getProtectedApplicationActor();
  const status = await getMyLegalStatus(actor);
  return {
    canManageDocuments: actor.roles.includes("ADMIN"),
    terms: status.current.TERMS ? toLegalVersionView(status.current.TERMS) : null,
    privacy: status.current.PRIVACY_POLICY ? toLegalVersionView(status.current.PRIVACY_POLICY) : null,
    acceptance: status.acceptance
      ? {
          termsVersionLabel: status.acceptance.terms.versionLabel,
          privacyVersionLabel: status.acceptance.privacy.versionLabel,
          acceptedAt: status.acceptance.acceptedAt.toISOString(),
        }
      : null,
    needsAcceptance: status.needsAcceptance,
    consentsOffered: status.consentsOffered,
    consents: status.consents.map((consent) => ({
      kind: consent.kind,
      current: consent.current ? toLegalVersionView(consent.current) : null,
      state: consent.state,
      decidedVersion: consent.latest ? toLegalVersionView(consent.latest.version) : null,
      newVersionAvailable: consent.newVersionAvailable,
      history: consent.history.map((event) => ({
        id: event.id,
        decision: event.decision,
        decidedAt: event.decidedAt.toISOString(),
        versionLabel: event.version.versionLabel,
        channel: event.channel,
      })),
    })),
  };
}

/** LG-D7 shell banner; a failure never blocks the shell (it simply shows no banner). */
export async function shouldShowLegalReacceptanceBanner(actor: ActorContext): Promise<boolean> {
  try {
    return await needsLegalReacceptance(actor);
  } catch {
    console.error("Legal re-acceptance status could not be loaded");
    return false;
  }
}
