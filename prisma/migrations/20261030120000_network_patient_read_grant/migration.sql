-- ADR-0016: Parent OWNER grants a Parent MEMBER read-only access to Patients of the Parent's
-- active network Children. Mirrors the E1 report export grant: both set or both null, MEMBER only.
ALTER TABLE "HospitalMembership" ADD COLUMN "networkPatientReadGrantedAt" TIMESTAMPTZ(3),
ADD COLUMN "networkPatientReadGrantedByUserId" UUID;

ALTER TABLE "HospitalMembership"
    ADD CONSTRAINT "HospitalMembership_network_patient_read_grant_check"
        CHECK (("networkPatientReadGrantedAt" IS NULL) = ("networkPatientReadGrantedByUserId" IS NULL)
            AND ("networkPatientReadGrantedAt" IS NULL OR "membershipType" = 'MEMBER'));

ALTER TABLE "HospitalMembership" ADD CONSTRAINT "HospitalMembership_networkPatientReadGrantedByUserId_fkey" FOREIGN KEY ("networkPatientReadGrantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
