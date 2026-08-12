-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HOSPITAL', 'OSM', 'PATIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PROVISIONED', 'INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "HospitalStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "Profession" AS ENUM ('DOCTOR', 'NURSE', 'COORDINATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PROVISIONED', 'INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "identityKeyHash" VARCHAR(64) NOT NULL,
    "givenName" VARCHAR(120),
    "familyName" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "authSubject" VARCHAR(255),
    "status" "UserStatus" NOT NULL DEFAULT 'PROVISIONED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "HospitalStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "membershipType" "MembershipType" NOT NULL,
    "profession" "Profession",
    "status" "MembershipStatus" NOT NULL DEFAULT 'PROVISIONED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resourceType" VARCHAR(120) NOT NULL,
    "resourceId" VARCHAR(255),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_identityKeyHash_key" ON "Person"("identityKeyHash");

-- CreateIndex
CREATE INDEX "Person_familyName_givenName_idx" ON "Person"("familyName", "givenName");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE INDEX "HospitalMembership_hospitalId_status_idx" ON "HospitalMembership"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalMembership_userId_hospitalId_key" ON "HospitalMembership"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("resourceType", "resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMembership" ADD CONSTRAINT "HospitalMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMembership" ADD CONSTRAINT "HospitalMembership_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
