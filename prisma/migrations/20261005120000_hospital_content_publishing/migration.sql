-- Phase 17I.2 adds a Hospital-owned publisher collection. Existing Hospitals
-- intentionally receive no content rows or backfill.
CREATE TYPE "HospitalContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "HospitalContentCategory" AS ENUM ('NCD', 'FOOD', 'EXERCISE', 'OTHER');

CREATE TABLE "HospitalContent" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "submissionNonce" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "category" "HospitalContentCategory" NOT NULL,
    "sourceText" VARCHAR(1000),
    "status" "HospitalContentStatus" NOT NULL DEFAULT 'DRAFT',
    "firstPublishedAt" TIMESTAMPTZ(3),
    "latestPublishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HospitalContent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HospitalContent_hospital_nonce_key" UNIQUE ("hospitalId", "submissionNonce"),
    CONSTRAINT "HospitalContent_publication_pair_check" CHECK (
        ("firstPublishedAt" IS NULL AND "latestPublishedAt" IS NULL)
        OR (
            "firstPublishedAt" IS NOT NULL
            AND "latestPublishedAt" IS NOT NULL
            AND "firstPublishedAt" <= "latestPublishedAt"
        )
    ),
    CONSTRAINT "HospitalContent_published_time_check" CHECK (
        "status" <> 'PUBLISHED'
        OR (
            "firstPublishedAt" IS NOT NULL
            AND "latestPublishedAt" IS NOT NULL
        )
    )
);

CREATE INDEX "HospitalContent_publisher_order_idx"
    ON "HospitalContent"("hospitalId", "updatedAt" DESC, "id" DESC);
CREATE INDEX "HospitalContent_patient_order_idx"
    ON "HospitalContent"("hospitalId", "status", "firstPublishedAt" DESC, "id" DESC);
CREATE INDEX "HospitalContent_patient_category_order_idx"
    ON "HospitalContent"("hospitalId", "status", "category", "firstPublishedAt" DESC, "id" DESC);

ALTER TABLE "HospitalContent"
    ADD CONSTRAINT "HospitalContent_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma migrations run as the privileged application schema owner. Explicitly
-- deny provider Data API roles direct table access when those roles exist.
DO $$
DECLARE
    data_api_role NAME;
BEGIN
    FOR data_api_role IN
        SELECT rolname
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."HospitalContent" FROM %I', data_api_role);
    END LOOP;
END
$$;
