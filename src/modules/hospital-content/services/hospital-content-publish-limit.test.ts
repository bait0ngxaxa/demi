import { HospitalContentCategory, HospitalContentStatus, HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ValidationError } from "@/shared/errors/application-error";

import { HOSPITAL_CONTENT_IMAGE_LIMIT, HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE } from "../domain/hospital-content";
import { publishHospitalContent } from "./hospital-content-service";

const contentId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "11111111-1111-4111-8111-111111111111";
const updatedAt = new Date("2026-10-24T00:00:00.000Z");
const owner: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  osmHospitalRelationships: [],
};

function databaseWithImages(imageCount: number) {
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const lockedContent = {
    id: contentId, hospitalId, title: "หัวข้อ", body: "เนื้อหา", category: HospitalContentCategory.OTHER, sourceText: null,
    status: HospitalContentStatus.DRAFT, firstPublishedAt: null, latestPublishedAt: null, createdAt: updatedAt, updatedAt,
  };
  const tx = {
    $queryRaw: vi.fn(async (query: { sql: string }) => {
      if (query.sql.includes('FROM "UserRole"')) return [{ userId: owner.userId, role: Role.HOSPITAL }];
      if (query.sql.includes('FROM "User"')) return [{ id: owner.userId, personId: owner.personId, status: UserStatus.ACTIVE }];
      if (query.sql.includes('FROM "HospitalMembership"')) return [{ id: "m", membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE }];
      if (query.sql.includes('FROM "Hospital"')) return [{ id: hospitalId, status: HospitalStatus.ACTIVE }];
      return [lockedContent];
    }),
    user: { findFirst: vi.fn(async () => ({ id: owner.userId })) },
    hospitalContent: {
      findUnique: vi.fn(async () => ({ hospitalId })),
      updateMany,
      findFirst: vi.fn(async () => ({ ...lockedContent, status: HospitalContentStatus.PUBLISHED, hospital: { id: hospitalId, hospitalCode: "H001", name: "โรงพยาบาล" }, images: [] })),
    },
    hospitalContentImage: { count: vi.fn(async () => imageCount) },
  };
  return { database: { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) } as never, tx, updateMany };
}

describe("publishHospitalContent image limit", () => {
  it("rejects a draft that holds more than the limit with a Thai message and does not publish", async () => {
    const { database, updateMany } = databaseWithImages(HOSPITAL_CONTENT_IMAGE_LIMIT + 1);

    const failure = await publishHospitalContent(owner, { contentId, expectedUpdatedAt: updatedAt.toISOString() }, { database }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toBe(HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([0, HOSPITAL_CONTENT_IMAGE_LIMIT])("publishes a draft with %i images", async (count) => {
    const { database, tx, updateMany } = databaseWithImages(count);

    const result = await publishHospitalContent(owner, { contentId, expectedUpdatedAt: updatedAt.toISOString() }, { database });

    expect(result.outcome).toBe("PUBLISHED");
    expect(tx.hospitalContentImage.count).toHaveBeenCalledWith({ where: { contentId } });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
