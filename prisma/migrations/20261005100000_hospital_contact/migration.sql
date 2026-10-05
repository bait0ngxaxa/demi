-- Phase 17I.1 adds independently maintained operational contact data.
-- Existing Hospital rows intentionally receive no Contact row or backfill.
CREATE TABLE "HospitalContact" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "addressText" VARCHAR(500),
    "phoneNumber" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalContact_hospitalId_key" ON "HospitalContact"("hospitalId");

ALTER TABLE "HospitalContact"
ADD CONSTRAINT "HospitalContact_hospitalId_fkey"
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
