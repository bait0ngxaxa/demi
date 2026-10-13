import { Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";
import { hashAccountRecoveryToken } from "./account-recovery-token-service";
import { completePatientAccountRecovery, getPatientAccountRecoveryAvailability, issuePatientAccountRecovery, type AccountRecoveryDependencies } from "./account-recovery-service";

const token = "A".repeat(43);
describe("global assisted recovery security gate", () => {
  it.each([Role.HOSPITAL, Role.ADMIN, Role.OSM, Role.PATIENT])("denies %s even with issuer-visible token and known national ID before any side effect", async (role) => {
    const actor: ActorContext = { userId: "issuer", personId: "person", roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] };
    const findPerson = vi.fn();
    const deliver = vi.fn();
    const replacePasswordAndRevokeSessions = vi.fn();
    const dependencies: AccountRecoveryDependencies = { findPerson, delivery: { channel: "ASSISTED", deliver }, replacePasswordAndRevokeSessions };
    Object.defineProperty(dependencies, "database", { get: () => { throw new Error("Database must not be accessed"); } });
    await expect(issuePatientAccountRecovery(actor, "relationship", { nationalId: "1000000000009", nationalIdConfirmation: "1000000000009", identityVerified: true }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPatientAccountRecoveryAvailability(token, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(completePatientAccountRecovery({ token, newPassword: "replacement-password-long", passwordConfirmation: "replacement-password-long" }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findPerson).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(replacePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });
  it("denies unauthenticated issuance and malformed credentials without weaker fallback", async () => {
    await expect(issuePatientAccountRecovery(null, null, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(completePatientAccountRecovery(null)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("retains one-way hashing for historical credential reconciliation", () => {
    expect(hashAccountRecoveryToken(token)).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
  });
});
