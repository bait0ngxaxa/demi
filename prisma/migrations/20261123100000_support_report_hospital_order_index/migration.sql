-- WB-DF-14 follow-up (2026-10-26): serves the ADMIN inbox Hospital filter and the "hospitalId" FK
-- ON DELETE RESTRICT check, both left unindexed when the Hospital-leading inbox index was replaced.
-- Forward-only and non-destructive; "SupportReport_admin_inbox_order_idx" is kept.
CREATE INDEX "SupportReport_hospital_order_idx" ON "SupportReport"("hospitalId", "createdAt" DESC, "id" DESC);
