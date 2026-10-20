import { beforeEach, describe, expect, it, vi } from "vitest";

const personStore = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => ({ person: personStore }),
}));

import { getActorDisplayName } from "./actor-display-name-service";

describe("getActorDisplayName", () => {
  beforeEach(() => {
    personStore.findUnique.mockReset();
  });

  it("reads only the authenticated actor's name and joins available parts", async () => {
    personStore.findUnique.mockResolvedValue({ givenName: "  สมชาย ", familyName: " ใจดี " });

    await expect(getActorDisplayName({
      userId: "user-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    })).resolves.toBe("สมชาย ใจดี");
    expect(personStore.findUnique).toHaveBeenCalledWith({
      where: { id: "person-1" },
      select: { givenName: true, familyName: true },
    });
  });

  it("uses a neutral fallback when the profile has no displayable name", async () => {
    personStore.findUnique.mockResolvedValue({ givenName: null, familyName: "  " });

    await expect(getActorDisplayName({
      userId: "user-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    })).resolves.toBe("ผู้ใช้งาน DEMI");
  });

  it("sanitizes identity-store failures", async () => {
    personStore.findUnique.mockRejectedValue(new Error("database details"));

    await expect(getActorDisplayName({
      userId: "user-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    })).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      message: "Actor display name could not be loaded",
    });
  });
});
