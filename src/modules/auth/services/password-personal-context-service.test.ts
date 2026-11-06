import { describe, expect, it, vi } from "vitest";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";

import {
  assertUserPasswordNotPersonal,
  loadPasswordPersonalContext,
  type PasswordPersonalContextDatabase,
} from "./password-personal-context-service";

const nationalId = "1101700203451";
const userId = "00000000-0000-4000-8000-000000000001";

function databaseWith(user: unknown): { database: PasswordPersonalContextDatabase; findUnique: ReturnType<typeof vi.fn> } {
  const findUnique = vi.fn(async () => user);
  return { database: { user: { findUnique } } as unknown as PasswordPersonalContextDatabase, findUnique };
}

const storedUser = {
  person: {
    identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
    patientProfile: {
      dateOfBirth: new Date("1985-12-31T00:00:00.000Z"),
      phoneNumber: "0898765432",
      hospitalRelationships: [{ hospitalNumber: "HN-55555" }, { hospitalNumber: null }],
    },
  },
  memberships: [{ contactPhone: "0811111111" }],
  osmHospitalRelationships: [{ contactPhone: null }],
};

describe("password personal context (ADR-0030)", () => {
  it("loads the User's data with one bounded query", async () => {
    const { database, findUnique } = databaseWith(storedUser);
    const context = await loadPasswordPersonalContext(database, userId);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: userId } }));
    expect(context.phoneNumbers).toEqual(["0898765432", "0811111111", null]);
    expect(context.hospitalNumbers).toEqual(["HN-55555", null]);
    expect(context.matchesNationalId?.(nationalId)).toBe(true);
    expect(context.matchesNationalId?.("1101700203450")).toBe(false);
  });

  it.each([
    [`x${nationalId}`, "stored National ID hash"],
    ["sky0898765432", "patient phone"],
    ["desk0811111111", "workforce contact phone"],
    ["hn55555river", "HN"],
    ["sky31122528", "Buddhist-year birthdate"],
  ])("rejects %s (%s)", async (password) => {
    const { database } = databaseWith(storedUser);
    await expect(assertUserPasswordNotPersonal(database, userId, password))
      .rejects.toMatchObject({ name: "PasswordPolicyRejectedError", reason: "PASSWORD_PERSONAL_INFO" });
  });

  it("accepts an unrelated password and still checks a supplied National ID for an unknown User", async () => {
    const { database } = databaseWith(storedUser);
    await expect(assertUserPasswordNotPersonal(database, userId, "lanternfig")).resolves.toBeUndefined();
    const missing = databaseWith(null);
    await expect(assertUserPasswordNotPersonal(missing.database, userId, `x${nationalId}`, { nationalIds: [nationalId] }))
      .rejects.toMatchObject({ reason: "PASSWORD_PERSONAL_INFO" });
  });

  it("reports an unavailable database as an infrastructure error", async () => {
    const findUnique = vi.fn(async () => { throw new Error("connection refused"); });
    const database = { user: { findUnique } } as unknown as PasswordPersonalContextDatabase;
    await expect(loadPasswordPersonalContext(database, userId)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });
});
