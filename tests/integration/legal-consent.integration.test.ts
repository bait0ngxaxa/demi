import { randomUUID } from "node:crypto";

import { LegalDocumentStatus, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  acceptCurrentLegalTerms,
  createLegalDraft,
  getLegalDocumentVersion,
  getMyLegalStatus,
  getUserLegalHistory,
  listLegalVersions,
  needsLegalReacceptance,
  publishLegalVersion,
  recordConsentDecision,
  updateLegalDraft,
} from "@/modules/legal/services/legal-service";
import { recordAccountCreationLegal } from "@/modules/legal/services/account-creation-legal-service";
import { clearLegalRecords, currentConsentVersionId, currentLegalAcceptance, publishNewerLegalVersion } from "./support/legal";

const prisma = getPrisma();
let sequence = 40_000;

function nationalIdFor(value: number): string {
  const firstTwelveDigits = `1${String(value).padStart(11, "0")}`;
  const weightedSum = Array.from(firstTwelveDigits, Number).reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  return `${firstTwelveDigits}${(11 - weightedSum % 11) % 10}`;
}

async function clearDatabase(): Promise<void> {
  await clearLegalRecords(prisma);
  await prisma.auditEvent.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.person.deleteMany();
}

async function createUser(roles: Role[]): Promise<{ actor: ActorContext; nationalId: string }> {
  sequence += 1;
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
      givenName: "ผู้ใช้",
      familyName: `ทดสอบ${sequence}`,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE, roles: { create: roles.map((role) => ({ role })) } },
    select: { id: true },
  });
  return {
    nationalId,
    actor: { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] },
  };
}

async function auditCount(action: string): Promise<number> {
  return prisma.auditEvent.count({ where: { action } });
}

describe("LG-1 legal documents, acceptance and consent records (ADR-0028)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("database invariants", () => {
    it("freezes a PUBLISHED version and keeps drafts editable", async () => {
      const termsId = (await currentLegalAcceptance(prisma)).termsVersionId;
      await expect(prisma.legalDocumentVersion.update({ where: { id: termsId }, data: { title: "แก้ไข" } })).rejects.toThrow();
      await expect(prisma.legalDocumentVersion.update({ where: { id: termsId }, data: { body: "แก้ไข" } })).rejects.toThrow();
      await expect(prisma.legalDocumentVersion.delete({ where: { id: termsId } })).rejects.toThrow();

      const draft = await prisma.legalDocumentVersion.create({
        data: { kind: "TERMS", versionLabel: "draft-db", title: "ร่าง", body: "เนื้อหา" },
        select: { id: true },
      });
      await expect(prisma.legalDocumentVersion.update({ where: { id: draft.id }, data: { body: "เนื้อหาใหม่" } })).resolves.toBeTruthy();
      await expect(prisma.legalDocumentVersion.update({ where: { id: draft.id }, data: { kind: "PRIVACY_POLICY" } })).rejects.toThrow();
    });

    it("keeps acceptances and consent events append-only and bound to published versions of the right kind", async () => {
      const { actor } = await createUser([Role.PATIENT]);
      const pair = await currentLegalAcceptance(prisma);
      await expect(prisma.legalAcceptance.create({
        data: { userId: actor.userId, termsVersionId: pair.privacyVersionId, privacyVersionId: pair.privacyVersionId, source: "SETTINGS", channel: "WEB" },
      })).rejects.toThrow();
      const draft = await prisma.legalDocumentVersion.create({ data: { kind: "TERMS", versionLabel: "draft-fk", title: "ร่าง", body: "เนื้อหา" }, select: { id: true } });
      await expect(prisma.legalAcceptance.create({
        data: { userId: actor.userId, termsVersionId: draft.id, privacyVersionId: pair.privacyVersionId, source: "SETTINGS", channel: "WEB" },
      })).rejects.toThrow();
      await expect(prisma.legalAcceptance.create({
        data: { userId: actor.userId, ...pair, source: "SETTINGS", channel: null },
      })).rejects.toThrow();

      const acceptance = await prisma.legalAcceptance.create({ data: { userId: actor.userId, ...pair, source: "SETTINGS", channel: "WEB" } });
      await expect(prisma.legalAcceptance.update({ where: { id: acceptance.id }, data: { channel: "LIFF" } })).rejects.toThrow();
      await expect(prisma.legalAcceptance.delete({ where: { id: acceptance.id } })).rejects.toThrow();

      const healthId = await currentConsentVersionId(prisma, "HEALTH_DATA_DISCLOSURE_CONSENT");
      await expect(prisma.consentEvent.create({
        data: { userId: actor.userId, kind: "MARKETING_CONSENT", documentVersionId: healthId, decision: "GIVEN", channel: "WEB", submissionNonce: randomUUID() },
      })).rejects.toThrow();
      await expect(prisma.consentEvent.create({
        data: { userId: actor.userId, kind: "TERMS", documentVersionId: pair.termsVersionId, decision: "GIVEN", channel: "WEB", submissionNonce: randomUUID() },
      })).rejects.toThrow();
      const event = await prisma.consentEvent.create({
        data: { userId: actor.userId, kind: "HEALTH_DATA_DISCLOSURE_CONSENT", documentVersionId: healthId, decision: "GIVEN", channel: "WEB", submissionNonce: randomUUID() },
      });
      await expect(prisma.consentEvent.update({ where: { id: event.id }, data: { decision: "WITHDRAWN" } })).rejects.toThrow();
      await expect(prisma.consentEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    });
  });

  describe("Terms + Privacy acceptance in settings", () => {
    it("flags a new TERMS version, accepts it and keeps the earlier acceptance", async () => {
      const { actor } = await createUser([Role.OSM]);
      const first = await currentLegalAcceptance(prisma);

      expect(await needsLegalReacceptance(actor)).toBe(true);
      await expect(acceptCurrentLegalTerms(actor, { ...first, channel: "WEB" })).resolves.toMatchObject({ alreadyAccepted: false });
      expect(await needsLegalReacceptance(actor)).toBe(false);
      await expect(acceptCurrentLegalTerms(actor, { ...first, channel: "LIFF" })).resolves.toMatchObject({ alreadyAccepted: true });
      expect(await prisma.legalAcceptance.count({ where: { userId: actor.userId } })).toBe(1);

      const newTermsId = await publishNewerLegalVersion(prisma, "TERMS", "terms-2");
      const status = await getMyLegalStatus(actor);
      expect(status.needsAcceptance).toBe(true);
      expect(status.acceptance?.terms.id).toBe(first.termsVersionId);
      expect(status.consentsOffered).toBe(false);

      await expect(acceptCurrentLegalTerms(actor, { ...first, channel: "WEB" })).resolves.toMatchObject({ alreadyAccepted: true });
      const staleOther = await createUser([Role.OSM]);
      await expect(acceptCurrentLegalTerms(staleOther.actor, { ...first, channel: "WEB" })).rejects.toMatchObject({ name: "LegalVersionConflictError" });

      await acceptCurrentLegalTerms(actor, { termsVersionId: newTermsId, privacyVersionId: first.privacyVersionId, channel: "LIFF" });
      const after = await getMyLegalStatus(actor);
      expect(after.needsAcceptance).toBe(false);
      expect(after.acceptance?.terms.id).toBe(newTermsId);
      expect(await prisma.legalAcceptance.findMany({ where: { userId: actor.userId }, orderBy: { acceptedAt: "asc" }, select: { termsVersionId: true, source: true, channel: true } }))
        .toEqual([
          { termsVersionId: first.termsVersionId, source: "SETTINGS", channel: "WEB" },
          { termsVersionId: newTermsId, source: "SETTINGS", channel: "LIFF" },
        ]);
      expect(await auditCount("legal.terms_accepted")).toBe(2);
    });
  });

  describe("consent decisions", () => {
    it("gives, withdraws and lists consent history for a PATIENT, idempotent by nonce", async () => {
      const { actor } = await createUser([Role.PATIENT]);
      const healthId = await currentConsentVersionId(prisma, "HEALTH_DATA_DISCLOSURE_CONSENT");
      const giveNonce = randomUUID();
      const give = { kind: "HEALTH_DATA_DISCLOSURE_CONSENT", documentVersionId: healthId, decision: "GIVEN", submissionNonce: giveNonce, channel: "WEB" } as const;

      await expect(recordConsentDecision(actor, { ...give, submissionNonce: randomUUID(), decision: "WITHDRAWN" })).rejects.toMatchObject({ code: "CONFLICT" });
      const given = await recordConsentDecision(actor, give);
      expect(given).toMatchObject({ decision: "GIVEN", replayed: false });
      await expect(recordConsentDecision(actor, give)).resolves.toMatchObject({ eventId: given.eventId, replayed: true });
      await expect(recordConsentDecision(actor, { ...give, decision: "WITHDRAWN" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(recordConsentDecision(actor, { ...give, submissionNonce: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });

      await recordConsentDecision(actor, { ...give, decision: "WITHDRAWN", submissionNonce: randomUUID() });
      await expect(recordConsentDecision(actor, { ...give, decision: "WITHDRAWN", submissionNonce: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });

      const status = await getMyLegalStatus(actor);
      expect(status.consentsOffered).toBe(true);
      const health = status.consents.find(({ kind }) => kind === "HEALTH_DATA_DISCLOSURE_CONSENT");
      expect(health?.state).toBe("WITHDRAWN");
      expect(health?.history.map(({ decision }) => decision)).toEqual(["WITHDRAWN", "GIVEN"]);
      expect(status.consents.find(({ kind }) => kind === "MARKETING_CONSENT")?.state).toBe("NONE");
      expect(await auditCount("legal.consent_given")).toBe(1);
      expect(await auditCount("legal.consent_withdrawn")).toBe(1);
    });

    it("keeps a given consent and flags a newer version; only the current version is accepted", async () => {
      const { actor } = await createUser([Role.PATIENT]);
      const marketingId = await currentConsentVersionId(prisma, "MARKETING_CONSENT");
      await recordConsentDecision(actor, { kind: "MARKETING_CONSENT", documentVersionId: marketingId, decision: "GIVEN", submissionNonce: randomUUID(), channel: "LIFF" });

      const newerId = await publishNewerLegalVersion(prisma, "MARKETING_CONSENT", "marketing-2");
      const status = await getMyLegalStatus(actor);
      const marketing = status.consents.find(({ kind }) => kind === "MARKETING_CONSENT");
      expect(marketing).toMatchObject({ state: "GIVEN", newVersionAvailable: true });
      expect(marketing?.latest?.version.id).toBe(marketingId);

      await expect(recordConsentDecision(actor, { kind: "MARKETING_CONSENT", documentVersionId: marketingId, decision: "WITHDRAWN", submissionNonce: randomUUID(), channel: "WEB" }))
        .rejects.toMatchObject({ name: "LegalVersionConflictError" });
      await recordConsentDecision(actor, { kind: "MARKETING_CONSENT", documentVersionId: newerId, decision: "GIVEN", submissionNonce: randomUUID(), channel: "WEB" });
      expect((await getMyLegalStatus(actor)).consents.find(({ kind }) => kind === "MARKETING_CONSENT")).toMatchObject({ state: "GIVEN", newVersionAvailable: false });
    });

    it("refuses consents in an account-creation step for a User without a PATIENT role", async () => {
      const { actor } = await createUser([Role.OSM]);
      const acceptLegal = await currentLegalAcceptance(prisma);
      const marketingId = await currentConsentVersionId(prisma, "MARKETING_CONSENT");
      await expect(prisma.$transaction((transaction) => recordAccountCreationLegal(transaction, {
        userId: actor.userId,
        acceptLegal,
        consents: [{ kind: "MARKETING_CONSENT", documentVersionId: marketingId }],
        source: "WORKFORCE_ACTIVATION",
        channel: "WEB",
      }))).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.legalAcceptance.count()).toBe(0);
      expect(await prisma.consentEvent.count()).toBe(0);
    });

    it("refuses consent decisions for an account without a PATIENT role", async () => {
      const { actor } = await createUser([Role.CAREGIVER]);
      const healthId = await currentConsentVersionId(prisma, "HEALTH_DATA_DISCLOSURE_CONSENT");
      await expect(recordConsentDecision(actor, { kind: "HEALTH_DATA_DISCLOSURE_CONSENT", documentVersionId: healthId, decision: "GIVEN", submissionNonce: randomUUID(), channel: "WEB" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.consentEvent.count()).toBe(0);
    });
  });

  describe("Platform ADMIN publishing (LG-D3)", () => {
    it("creates, edits, previews and publishes a draft; the published version becomes current and immutable", async () => {
      const { actor: admin } = await createUser([Role.ADMIN]);
      const { versionId } = await createLegalDraft(admin, { kind: "PRIVACY_POLICY", versionLabel: "privacy-2", title: "นโยบาย", body: "# หัวข้อ\n\nเนื้อหา" });
      await expect(createLegalDraft(admin, { kind: "PRIVACY_POLICY", versionLabel: "privacy-2", title: "ซ้ำ", body: "ซ้ำ" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(getLegalDocumentVersion({ kind: "PRIVACY_POLICY", versionLabel: "privacy-2" })).rejects.toMatchObject({ code: "NOT_FOUND" });

      const edited = await updateLegalDraft(admin, { versionId, versionLabel: "privacy-2", title: "นโยบาย ฉบับที่ 2", body: "เนื้อหาใหม่" });
      const draft = (await listLegalVersions(admin)).find(({ id }) => id === versionId);
      expect(draft).toMatchObject({ status: LegalDocumentStatus.DRAFT, isCurrent: false });

      await expect(publishLegalVersion(admin, { versionId, expectedUpdatedAt: new Date(edited.updatedAt.getTime() - 1000).toISOString() }))
        .rejects.toMatchObject({ code: "CONFLICT" });
      await publishLegalVersion(admin, { versionId, expectedUpdatedAt: edited.updatedAt.toISOString() });
      await expect(publishLegalVersion(admin, { versionId, expectedUpdatedAt: edited.updatedAt.toISOString() })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(updateLegalDraft(admin, { versionId, versionLabel: "privacy-2", title: "แก้", body: "แก้" })).rejects.toMatchObject({ code: "CONFLICT" });

      expect((await currentLegalAcceptance(prisma)).privacyVersionId).toBe(versionId);
      await expect(getLegalDocumentVersion({ kind: "PRIVACY_POLICY", versionLabel: "privacy-2" })).resolves.toMatchObject({ isCurrent: true, body: "เนื้อหาใหม่" });
      expect(await auditCount("legal.version_published")).toBe(1);
      const publishedAudit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "legal.version_published" }, select: { metadata: true } });
      expect(JSON.stringify(publishedAudit.metadata)).not.toContain("เนื้อหาใหม่");
    });

    it("refuses every ADMIN operation for a non-ADMIN", async () => {
      const { actor } = await createUser([Role.HOSPITAL]);
      const forbidden = { code: "FORBIDDEN" };
      await expect(listLegalVersions(actor)).rejects.toMatchObject(forbidden);
      await expect(createLegalDraft(actor, { kind: "TERMS", versionLabel: "x-1", title: "x", body: "x" })).rejects.toMatchObject(forbidden);
      await expect(publishLegalVersion(actor, { versionId: randomUUID(), expectedUpdatedAt: new Date().toISOString() })).rejects.toMatchObject(forbidden);
      await expect(getUserLegalHistory(actor, { nationalId: nationalIdFor(1) })).rejects.toMatchObject(forbidden);
      // A forged ADMIN role in the actor context is not enough: the persisted roles decide.
      await expect(listLegalVersions({ ...actor, roles: [Role.ADMIN] })).rejects.toMatchObject(forbidden);
    });

    it("returns one User's legal history by exact national ID and audits every lookup", async () => {
      const { actor: admin } = await createUser([Role.ADMIN]);
      const patient = await createUser([Role.PATIENT]);
      const pair = await currentLegalAcceptance(prisma);
      await acceptCurrentLegalTerms(patient.actor, { ...pair, channel: "WEB" });
      const healthId = await currentConsentVersionId(prisma, "HEALTH_DATA_DISCLOSURE_CONSENT");
      await recordConsentDecision(patient.actor, { kind: "HEALTH_DATA_DISCLOSURE_CONSENT", documentVersionId: healthId, decision: "GIVEN", submissionNonce: randomUUID(), channel: "WEB" });

      const history = await getUserLegalHistory(admin, { nationalId: patient.nationalId });
      expect(history).toMatchObject({ userId: patient.actor.userId });
      expect(history?.acceptances).toHaveLength(1);
      expect(history?.consentEvents.map(({ kind, decision }) => `${kind}:${decision}`)).toEqual(["HEALTH_DATA_DISCLOSURE_CONSENT:GIVEN"]);
      await expect(getUserLegalHistory(admin, { nationalId: nationalIdFor(39_999) })).resolves.toBeNull();

      const audits = await prisma.auditEvent.findMany({ where: { action: "legal.user_history_read" }, select: { actorUserId: true, metadata: true } });
      expect(audits).toHaveLength(2);
      expect(audits.every(({ actorUserId }) => actorUserId === admin.userId)).toBe(true);
      expect(JSON.stringify(audits)).not.toContain(patient.nationalId);
    });
  });
});
