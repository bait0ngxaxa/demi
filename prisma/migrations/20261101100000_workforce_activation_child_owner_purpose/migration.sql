-- ADR-0018 (O-D6): first or replacement OWNER of a Parent-created Child. ADD VALUE cannot share a transaction with its first use.
ALTER TYPE "WorkforceActivationPurpose" ADD VALUE 'CHILD_OWNER_ONBOARDING';
