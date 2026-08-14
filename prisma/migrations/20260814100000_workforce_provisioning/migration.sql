-- CreateEnum
CREATE TYPE "WorkforceActivationMode" AS ENUM ('REMOTE', 'ASSISTED');

-- CreateTable
CREATE TABLE "OsmHospitalRelationship" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PROVISIONED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsmHospitalRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceActivation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "mode" "WorkforceActivationMode" NOT NULL DEFAULT 'REMOTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OsmHospitalRelationship_userId_hospitalId_key" ON "OsmHospitalRelationship"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "OsmHospitalRelationship_hospitalId_status_idx" ON "OsmHospitalRelationship"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "OsmHospitalRelationship_userId_status_idx" ON "OsmHospitalRelationship"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceActivation_tokenHash_key" ON "WorkforceActivation"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkforceActivation_userId_createdAt_idx" ON "WorkforceActivation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkforceActivation_expiresAt_idx" ON "WorkforceActivation"("expiresAt");

-- Only one non-consumed, non-revoked activation may exist for a User.
CREATE UNIQUE INDEX "WorkforceActivation_one_usable_per_user_key"
    ON "WorkforceActivation"("userId")
    WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "OsmHospitalRelationship" ADD CONSTRAINT "OsmHospitalRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsmHospitalRelationship" ADD CONSTRAINT "OsmHospitalRelationship_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceActivation" ADD CONSTRAINT "WorkforceActivation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
