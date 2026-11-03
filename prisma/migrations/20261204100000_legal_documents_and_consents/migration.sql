-- LG-1 (ADR-0028): versioned legal documents (TERMS, PRIVACY_POLICY and the two PDPA consents), the Terms +
-- Privacy acceptance record and the append-only consent decisions. Pre-production: no existing users to migrate.

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('TERMS', 'PRIVACY_POLICY', 'HEALTH_DATA_DISCLOSURE_CONSENT', 'MARKETING_CONSENT');

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LegalChannel" AS ENUM ('WEB', 'LIFF');

-- CreateEnum
CREATE TYPE "LegalAcceptanceSource" AS ENUM ('SELF_REGISTRATION', 'PATIENT_ACTIVATION', 'WORKFORCE_ACTIVATION', 'HOSPITAL_ONBOARDING', 'CAREGIVER_ACCOUNT', 'SETTINGS', 'ADMIN_BOOTSTRAP');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GIVEN', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" UUID NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "versionLabel" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "publishedByUserId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "termsVersionId" UUID NOT NULL,
    "privacyVersionId" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "LegalChannel",
    "source" "LegalAcceptanceSource" NOT NULL,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "documentVersionId" UUID NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "LegalChannel" NOT NULL,
    "submissionNonce" UUID NOT NULL,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_kind_status_publishedAt_idx" ON "LegalDocumentVersion"("kind", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_kind_versionLabel_key" ON "LegalDocumentVersion"("kind", "versionLabel");

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_acceptedAt_idx" ON "LegalAcceptance"("userId", "acceptedAt");

-- CreateIndex
CREATE INDEX "LegalAcceptance_termsVersionId_idx" ON "LegalAcceptance"("termsVersionId");

-- CreateIndex
CREATE INDEX "LegalAcceptance_privacyVersionId_idx" ON "LegalAcceptance"("privacyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_termsVersionId_privacyVersionId_key" ON "LegalAcceptance"("userId", "termsVersionId", "privacyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentEvent_submissionNonce_key" ON "ConsentEvent"("submissionNonce");

-- CreateIndex
CREATE INDEX "ConsentEvent_userId_kind_decidedAt_idx" ON "ConsentEvent"("userId", "kind", "decidedAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_documentVersionId_idx" ON "ConsentEvent"("documentVersionId");

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_privacyVersionId_fkey" FOREIGN KEY ("privacyVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Value guards that Prisma cannot express.
ALTER TABLE "LegalDocumentVersion"
    ADD CONSTRAINT "LegalDocumentVersion_publication_check"
    CHECK (
        ("status" = 'DRAFT' AND "publishedAt" IS NULL AND "publishedByUserId" IS NULL)
        OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
    );

ALTER TABLE "LegalDocumentVersion"
    ADD CONSTRAINT "LegalDocumentVersion_text_check"
    CHECK (
        length(btrim("versionLabel")) > 0
        AND "versionLabel" = btrim("versionLabel")
        AND length(btrim("title")) > 0
        AND length(btrim("body")) > 0
        AND length("body") <= 100000
    );

-- "Current" = latest publishedAt per kind, so two published versions of a kind never share an instant.
CREATE UNIQUE INDEX "LegalDocumentVersion_kind_publishedAt_key"
ON "LegalDocumentVersion" ("kind", "publishedAt")
WHERE "status" = 'PUBLISHED';

-- The operator CLI is neither WEB nor LIFF; every other source names its channel.
ALTER TABLE "LegalAcceptance"
    ADD CONSTRAINT "LegalAcceptance_channel_check"
    CHECK (("source" = 'ADMIN_BOOTSTRAP') = ("channel" IS NULL));

ALTER TABLE "ConsentEvent"
    ADD CONSTRAINT "ConsentEvent_kind_check"
    CHECK ("kind" IN ('HEALTH_DATA_DISCLOSURE_CONSENT', 'MARKETING_CONSENT'));

-- A PUBLISHED version is frozen and never removed; drafts stay editable and removable. Only the disposable
-- demo/test reset may remove published rows, with the transaction-local switch of 20261102100000.
CREATE FUNCTION "guard_legal_document_version"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'PUBLISHED' AND current_setting('demi.service_area_purge', true) IS DISTINCT FROM 'demo-reset' THEN
      RAISE EXCEPTION 'A published legal document version cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'A published legal document version cannot be changed' USING ERRCODE = '23514';
  END IF;

  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'The kind of a legal document version cannot be changed' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "legal_document_version_guard"
BEFORE UPDATE OR DELETE ON "LegalDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_legal_document_version"();

-- Acceptances and consent decisions are append-only evidence. Only the disposable demo/test reset may remove them.
CREATE FUNCTION "guard_legal_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demi.service_area_purge', true) = 'demo-reset' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "legal_acceptance_append_only"
BEFORE UPDATE OR DELETE ON "LegalAcceptance"
FOR EACH ROW EXECUTE FUNCTION "guard_legal_append_only"();

CREATE TRIGGER "consent_event_append_only"
BEFORE UPDATE OR DELETE ON "ConsentEvent"
FOR EACH ROW EXECUTE FUNCTION "guard_legal_append_only"();

-- An acceptance names one PUBLISHED TERMS and one PUBLISHED PRIVACY_POLICY version.
CREATE FUNCTION "check_legal_acceptance_versions"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "LegalDocumentVersion"
    WHERE "id" = NEW."termsVersionId" AND "kind" = 'TERMS' AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Legal acceptance must name a published TERMS version' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "LegalDocumentVersion"
    WHERE "id" = NEW."privacyVersionId" AND "kind" = 'PRIVACY_POLICY' AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Legal acceptance must name a published PRIVACY_POLICY version' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "legal_acceptance_versions_check"
BEFORE INSERT ON "LegalAcceptance"
FOR EACH ROW EXECUTE FUNCTION "check_legal_acceptance_versions"();

-- A consent decision names a PUBLISHED version of its own kind.
CREATE FUNCTION "check_consent_event_version"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "LegalDocumentVersion"
    WHERE "id" = NEW."documentVersionId" AND "kind" = NEW."kind" AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Consent decision must name a published version of the same kind' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

CREATE TRIGGER "consent_event_version_check"
BEFORE INSERT ON "ConsentEvent"
FOR EACH ROW EXECUTE FUNCTION "check_consent_event_version"();

-- Legal and consent records are reached only through the application server.
ALTER TABLE "LegalDocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LegalDocumentVersion" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "LegalAcceptance" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "ConsentEvent" FROM PUBLIC;

-- Supabase Data API roles are absent from the plain PostgreSQL integration database.
DO $$
DECLARE
    data_api_role NAME;
BEGIN
    FOR data_api_role IN
        SELECT rolname
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."LegalDocumentVersion" FROM %I', data_api_role);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."LegalAcceptance" FROM %I', data_api_role);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."ConsentEvent" FROM %I', data_api_role);
    END LOOP;
END
$$;

-- G-01: the texts belong to the partner agency. One clearly marked PUBLISHED placeholder per kind lets every
-- account-creation step record a real version until the Platform ADMIN publishes the agency text.
INSERT INTO "LegalDocumentVersion"
    ("id", "kind", "versionLabel", "title", "body", "isPlaceholder", "status", "publishedAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'TERMS', 'placeholder-1', 'ข้อกำหนดและเงื่อนไขการใช้บริการ',
     E'ร่าง — รอข้อความจากหน่วยงาน\n\nข้อความนี้เป็นฉบับชั่วคราวที่ระบบใช้ระหว่างรอข้อกำหนดและเงื่อนไขการใช้บริการฉบับจริงจากหน่วยงานผู้ให้บริการ',
     true, 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'PRIVACY_POLICY', 'placeholder-1', 'นโยบายการคุ้มครองข้อมูลส่วนบุคคล',
     E'ร่าง — รอข้อความจากหน่วยงาน\n\nข้อความนี้เป็นฉบับชั่วคราวที่ระบบใช้ระหว่างรอนโยบายการคุ้มครองข้อมูลส่วนบุคคลฉบับจริงจากหน่วยงานผู้ให้บริการ',
     true, 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'HEALTH_DATA_DISCLOSURE_CONSENT', 'placeholder-1', 'หนังสือแสดงความยินยอมให้เปิดเผยข้อมูลสุขภาพส่วนบุคคล',
     E'ร่าง — รอข้อความจากหน่วยงาน\n\nข้อความนี้เป็นฉบับชั่วคราวที่ระบบใช้ระหว่างรอหนังสือแสดงความยินยอมให้เปิดเผยข้อมูลสุขภาพส่วนบุคคลฉบับจริงจากหน่วยงานผู้ให้บริการ',
     true, 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'MARKETING_CONSENT', 'placeholder-1', 'หนังสือตกลงยินยอมในการเปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาด',
     E'ร่าง — รอข้อความจากหน่วยงาน\n\nข้อความนี้เป็นฉบับชั่วคราวที่ระบบใช้ระหว่างรอหนังสือตกลงยินยอมในการเปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาดฉบับจริงจากหน่วยงานผู้ให้บริการ',
     true, 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
