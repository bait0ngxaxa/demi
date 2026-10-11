import { HospitalStatus, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError } from "@/shared/errors/application-error";

import {
  buildHospitalHierarchyDirectory,
  getHospitalHierarchyContext,
  resolveHospitalOwnerDirectChildFacility,
  resolveDirectChildFacilities,
  type HospitalHierarchyDatabase,
  type HospitalHierarchyUnit,
} from "./hospital-hierarchy-service";

function unit(
  id: string,
  hospitalCode: string,
  parentHospitalId: string | null,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): HospitalHierarchyUnit {
  return { id, hospitalCode, name: `โรงพยาบาล ${hospitalCode}`, status, parentHospitalId };
}

describe("Hospital hierarchy projections", () => {
  it("groups only direct children, including pending and suspended directory units", () => {
    const parent = unit("main-1", "MAIN-1", null);
    const activeChild = unit("child-1", "CHILD-1", parent.id, HospitalStatus.ACTIVE);
    const pendingChild = unit("child-2", "CHILD-2", parent.id, HospitalStatus.PENDING_VERIFICATION);
    const suspendedChild = unit("child-3", "CHILD-3", parent.id, HospitalStatus.SUSPENDED);
    const standalone = unit("main-2", "MAIN-2", null);
    const grandchild = unit("grandchild-1", "GRANDCHILD-1", activeChild.id);

    const directory = buildHospitalHierarchyDirectory([
      grandchild,
      suspendedChild,
      standalone,
      pendingChild,
      activeChild,
      parent,
    ]);

    const parentGroup = directory.groups.find(({ mainHospital }) => mainHospital.id === parent.id);
    const standaloneGroup = directory.groups.find(({ mainHospital }) => mainHospital.id === standalone.id);
    expect(parentGroup?.directChildren.map(({ id }) => id)).toEqual([
      activeChild.id,
      pendingChild.id,
      suspendedChild.id,
    ]);
    expect(standaloneGroup?.directChildren).toEqual([]);
    expect(directory.diagnostics).toHaveLength(1);
    expect(directory.diagnostics[0]?.hospital.id).toBe(grandchild.id);
    expect(directory.diagnostics[0]?.issues[0]?.code).toBe("PARENT_IS_SUBORDINATE");
    expect(directory.mainHospitalCount).toBe(2);
    expect(directory.subordinateHospitalCount).toBe(4);
  });

  it("marks missing parents, self-parent relationships and cycles as diagnostics", () => {
    const orphan = unit("orphan", "ORPHAN", "deleted-parent");
    const selfParent = unit("self", "SELF", "self");
    const cycleA = unit("cycle-a", "CYCLE-A", "cycle-b");
    const cycleB = unit("cycle-b", "CYCLE-B", "cycle-a");
    const directory = buildHospitalHierarchyDirectory([orphan, selfParent, cycleA, cycleB]);
    const issueCodes = directory.diagnostics.flatMap(({ issues }) => issues.map(({ code }) => code));

    expect(issueCodes).toContain("MISSING_PARENT");
    expect(issueCodes).toContain("SELF_PARENT");
    expect(issueCodes.filter((code) => code === "CYCLE")).toHaveLength(2);
    expect(directory.groups).toEqual([]);
  });

  it("returns a safe diagnostic context when the stored parent reference has no target", async () => {
    const hospitalId = "11111111-1111-4111-8111-111111111111";
    const missingParentId = "22222222-2222-4222-8222-222222222222";
    const actor = {
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const record = {
      id: hospitalId,
      hospitalCode: "MAIN-1",
      name: "โรงพยาบาลแม่ข่าย",
      status: HospitalStatus.ACTIVE,
      parentHospitalId: missingParentId,
      parentHospital: null,
      childHospitals: [],
    };
    const hospitalFindUnique = vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === hospitalId ? record : null,
    );
    const database = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actor.userId }) },
      hospital: { findUnique: hospitalFindUnique },
      hospitalMembership: { findFirst: vi.fn() },
    } as unknown as HospitalHierarchyDatabase;

    const context = await getHospitalHierarchyContext(actor, hospitalId, database);

    expect(context.classification).toBe("SUBORDINATE");
    expect(context.parentHospital).toBeNull();
    expect(context.directChildren).toEqual([]);
    expect(context.issues.map(({ code }) => code)).toContain("MISSING_PARENT");
    await expect(resolveDirectChildFacilities(actor, hospitalId, database)).rejects.toBeInstanceOf(ConflictError);
  });

  it("fails safely for an invalid Hospital context", async () => {
    const actor = {
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    await expect(getHospitalHierarchyContext(actor, "not-a-hospital-id", {} as HospitalHierarchyDatabase))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it("resolves one direct Child through current Parent OWNER scope even for a multi-role ADMIN/HOSPITAL actor", async () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const childId = "22222222-2222-4222-8222-222222222222";
    const actor = {
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [Role.ADMIN, Role.HOSPITAL],
      hospitalMemberships: [{
        hospitalId: parentId,
        membershipType: "OWNER" as const,
        profession: null,
        status: "ACTIVE" as const,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
      osmHospitalRelationships: [],
    };
    const parent = {
      ...unit(parentId, "PARENT", null),
      parentHospital: null,
      childHospitals: [unit(childId, "CHILD", parentId)],
    };
    const findFirst = vi.fn().mockResolvedValue({ hospital: parent });
    const database = {
      hospitalMembership: { findFirst },
      hospital: { findUnique: vi.fn() },
      user: { findFirst: vi.fn() },
    } as unknown as HospitalHierarchyDatabase;

    await expect(resolveHospitalOwnerDirectChildFacility(actor, parentId, childId, database)).resolves.toMatchObject({
      parent: { id: parentId, status: HospitalStatus.ACTIVE, parentHospitalId: null },
      child: { id: childId, status: HospitalStatus.ACTIVE, parentHospitalId: parentId },
      issues: [],
    });
    expect(findFirst).toHaveBeenCalledOnce();
    expect(database.user?.findFirst).not.toHaveBeenCalled();
  });
});
