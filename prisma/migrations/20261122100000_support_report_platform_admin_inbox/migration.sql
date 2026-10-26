-- WB-DF-14 (Product Owner 2026-10-26): usage-problem reports are received only by the platform ADMIN.
-- "hospitalId" becomes optional reporter-selected context and never authorizes a reader. Forward-only and
-- non-destructive: existing rows keep their Hospital and the FK (ON DELETE RESTRICT) is unchanged.
ALTER TABLE "SupportReport" ALTER COLUMN "hospitalId" DROP NOT NULL;

-- The ADMIN inbox is ordered across every Hospital; the reporter index still serves the reporter history.
DROP INDEX "SupportReport_inbox_order_idx";
CREATE INDEX "SupportReport_admin_inbox_order_idx" ON "SupportReport"("status", "createdAt" DESC, "id" DESC);
