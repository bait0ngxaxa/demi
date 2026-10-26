import { describe, expect, it } from "vitest";

import { supportReportAdminInboxQuerySchema } from "./support-report-schemas";

// WB-DF-14 P1 (Product Owner 2026-10-26): the ADMIN inbox opens on NEW; every status is the explicit ALL value.
describe("supportReportAdminInboxQuerySchema status resolution", () => {
  it("resolves a missing status to NEW", () => {
    expect(supportReportAdminInboxQuerySchema.parse({})).toEqual({ status: "NEW" });
  });

  it.each(["NEW", "ACKNOWLEDGED", "RESOLVED", "ALL"])("keeps the explicit status %s", (status) => {
    expect(supportReportAdminInboxQuerySchema.parse({ status }).status).toBe(status);
  });

  it.each(["", "all", "OPEN", null])("rejects the status %j", (status) => {
    expect(supportReportAdminInboxQuerySchema.safeParse({ status }).success).toBe(false);
  });
});
