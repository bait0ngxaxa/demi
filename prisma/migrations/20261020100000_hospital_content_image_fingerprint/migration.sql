-- Existing rows keep NULL: their payload fingerprint is unknown and must never be treated as a replay match.
ALTER TABLE "HospitalContentImage" ADD COLUMN "contentSha256" CHAR(64);
ALTER TABLE "HospitalContentImage" ADD CONSTRAINT "HospitalContentImage_content_sha256_check"
  CHECK ("contentSha256" IS NULL OR "contentSha256" ~ '^[0-9a-f]{64}$');
