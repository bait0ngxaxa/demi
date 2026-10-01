-- Published Phase 17F.1 migration is immutable. Bind authoritative evidence to
-- its exact invitation pair, retaining the existing Prisma source relation and
-- unique sourceInvitationId. Prisma models the target key; this additional FK
-- intentionally shares scalar fields with the existing participant relations.
CREATE UNIQUE INDEX "CaregiverInvitation_source_pair_key"
    ON "CaregiverInvitation"("id", "patientProfileId", "caregiverUserId");

ALTER TABLE "CaregiverRelationship"
    ADD CONSTRAINT "CaregiverRelationship_source_pair_fkey"
    FOREIGN KEY ("sourceInvitationId", "patientProfileId", "caregiverUserId")
    REFERENCES "CaregiverInvitation"("id", "patientProfileId", "caregiverUserId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ACCEPTED source status is an application-service transaction invariant,
-- not a constraint enforced by this FK. No lifecycle trigger is introduced.
