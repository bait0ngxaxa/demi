-- ADR-0024: first or replacement OWNER of a Parent Hospital invited by platform ADMIN. ADD VALUE cannot share a transaction with its first use.
ALTER TYPE "WorkforceActivationPurpose" ADD VALUE 'PARENT_OWNER_ONBOARDING';
