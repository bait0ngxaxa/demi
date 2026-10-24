import { HospitalContentStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: audit.recordAuditEvent }));

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { PatientEvidenceStorage } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { removeHospitalContentImage, reorderHospitalContentImages } from "./hospital-content-image-service";

const contentId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "11111111-1111-4111-8111-111111111111";
const ids = [1, 2, 3].map((n) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`);
const [imageA, imageB, imageC] = ids as [string, string, string];

const owner: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

type Row = { id: string; sortOrder: number; storageObjectKey: string };

/** Minimal stateful stand-in for the content row lock and the unique (contentId, sortOrder) index. */
function fakeDatabase(options: { owned?: boolean; locked?: boolean; status?: HospitalContentStatus; images?: string[] } = {}) {
  const rows: Row[] = (options.images ?? ids).map((id, sortOrder) => ({ id, sortOrder, storageObjectKey: `hospital-content/${hospitalId}/${contentId}/${id}` }));
  const updates: Array<{ id: string; sortOrder: number }> = [];
  const tx = {
    $queryRaw: vi.fn(async () => (options.locked === false ? [] : [{ id: contentId, hospitalId, status: options.status ?? HospitalContentStatus.DRAFT }])),
    hospitalContentImage: {
      findMany: vi.fn(async () => [...rows].sort((a, b) => a.sortOrder - b.sortOrder)),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { rows.splice(rows.findIndex(({ id }) => id === where.id), 1); }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { sortOrder: number } }) => {
        if (rows.some(({ id, sortOrder }) => id !== where.id && sortOrder === data.sortOrder)) throw new Error("unique violation");
        if (data.sortOrder < 0 || data.sortOrder > 4) throw new Error("check violation");
        (rows.find(({ id }) => id === where.id) as Row).sortOrder = data.sortOrder;
        updates.push({ id: where.id, sortOrder: data.sortOrder });
      }),
    },
  };
  const database = {
    hospitalContent: { findFirst: vi.fn(async () => (options.owned === false ? null : { id: contentId })) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const order = (): string[] => [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map(({ id }) => id);
  return { database: database as never, tx, rows, updates, order };
}

function fakeStorage(removeObject: PatientEvidenceStorage["removeObject"] = vi.fn(async () => undefined)) {
  return { removeObject, uploadObject: vi.fn(), createTemporaryAccessUrl: vi.fn() } as unknown as PatientEvidenceStorage;
}

beforeEach(() => {
  audit.recordAuditEvent.mockReset();
  audit.recordAuditEvent.mockResolvedValue(undefined);
});

describe("removeHospitalContentImage", () => {
  it("removes the image, keeps sortOrder contiguous, audits and deletes the object after commit", async () => {
    const db = fakeDatabase();
    const storage = fakeStorage();

    const result = await removeHospitalContentImage(owner, { contentId, imageId: imageA }, { database: db.database, storage });

    expect(result).toEqual({ imageIds: [imageB, imageC] });
    expect(db.rows.map(({ sortOrder }) => sortOrder).sort()).toEqual([0, 1]);
    expect(db.order()).toEqual([imageB, imageC]);
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: owner.userId, action: "hospital_content.image_removed", resourceId: imageA, metadata: { contentId, hospitalId } }), db.tx);
    expect(storage.removeObject).toHaveBeenCalledWith({ objectKey: `hospital-content/${hospitalId}/${contentId}/${imageA}` });
  });

  it("keeps the committed removal when the storage object cannot be deleted, and logs it", async () => {
    const db = fakeDatabase();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = fakeStorage(vi.fn(async () => { throw new Error("storage down"); }));

    await expect(removeHospitalContentImage(owner, { contentId, imageId: imageC }, { database: db.database, storage })).resolves.toEqual({ imageIds: [imageA, imageB] });
    expect(log).toHaveBeenCalledWith("hospital_content_image_remove_compensation_failed", { imageId: imageC });
    log.mockRestore();
  });

  it("does not touch storage when the transaction fails", async () => {
    const db = fakeDatabase();
    audit.recordAuditEvent.mockRejectedValue(new Error("audit down"));
    const storage = fakeStorage();

    await expect(removeHospitalContentImage(owner, { contentId, imageId: imageA }, { database: db.database, storage })).rejects.toBeInstanceOf(InfrastructureError);
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it.each([
    ["an actor without the HOSPITAL role", { ...owner, roles: [Role.OSM] }, {}, ForbiddenError],
    ["an actor with an ADMIN-only role", { ...owner, roles: [Role.ADMIN] }, {}, ForbiddenError],
    ["a non-owner or other-hospital actor", owner, { owned: false }, NotFoundError],
    ["a membership revoked before the lock", owner, { locked: false }, ForbiddenError],
    ["a PUBLISHED content", owner, { status: HospitalContentStatus.PUBLISHED }, ConflictError],
    ["an ARCHIVED content", owner, { status: HospitalContentStatus.ARCHIVED }, ConflictError],
  ])("rejects %s", async (_name, actor, dbOptions, errorType) => {
    const db = fakeDatabase(dbOptions);
    const storage = fakeStorage();
    await expect(removeHospitalContentImage(actor as ActorContext, { contentId, imageId: imageA }, { database: db.database, storage })).rejects.toBeInstanceOf(errorType);
    expect(db.rows).toHaveLength(3);
    expect(storage.removeObject).not.toHaveBeenCalled();
    expect(audit.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing actor, a malformed id and an image of another content", async () => {
    const db = fakeDatabase();
    await expect(removeHospitalContentImage(null, { contentId, imageId: imageA }, { database: db.database })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeHospitalContentImage(owner, { contentId, imageId: "nope" }, { database: db.database })).rejects.toBeInstanceOf(ValidationError);
    await expect(removeHospitalContentImage(owner, { contentId, imageId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000009" }, { database: db.database, storage: fakeStorage() })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reorderHospitalContentImages", () => {
  it("applies the order through collision-free moves and audits once", async () => {
    const db = fakeDatabase();

    const result = await reorderHospitalContentImages(owner, { contentId, imageIds: [imageC, imageA, imageB] }, { database: db.database });

    expect(result).toEqual({ imageIds: [imageC, imageA, imageB] });
    expect(db.order()).toEqual([imageC, imageA, imageB]);
    expect(db.rows.map(({ sortOrder }) => sortOrder).sort()).toEqual([0, 1, 2]);
    expect(audit.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "hospital_content.images_reordered", resourceId: contentId }), db.tx);
  });

  it("is a no-op without writes or audit when the order is unchanged", async () => {
    const db = fakeDatabase();
    await expect(reorderHospitalContentImages(owner, { contentId, imageIds: ids }, { database: db.database })).resolves.toEqual({ imageIds: ids });
    expect(db.updates).toEqual([]);
    expect(audit.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing image", [imageA, imageB]],
    ["a foreign image", [imageA, imageB, "bbbbbbbb-bbbb-4bbb-8bbb-000000000009"]],
    ["a duplicate", [imageA, imageA, imageB]],
  ])("rejects an order with %s as a stale request", async (_name, imageIds) => {
    const db = fakeDatabase();
    await expect(reorderHospitalContentImages(owner, { contentId, imageIds }, { database: db.database })).rejects.toBeInstanceOf(ConflictError);
    expect(db.updates).toEqual([]);
  });

  it("rejects a malformed order and a legacy draft with no spare slot", async () => {
    await expect(reorderHospitalContentImages(owner, { contentId, imageIds: "x" }, { database: fakeDatabase().database })).rejects.toBeInstanceOf(ValidationError);
    await expect(reorderHospitalContentImages(owner, { contentId, imageIds: ["x"] }, { database: fakeDatabase().database })).rejects.toBeInstanceOf(ValidationError);
    const five = [1, 2, 3, 4, 5].map((n) => `cccccccc-cccc-4ccc-8ccc-00000000000${n}`);
    const db = fakeDatabase({ images: five });
    await expect(reorderHospitalContentImages(owner, { contentId, imageIds: [...five].reverse() }, { database: db.database })).rejects.toBeInstanceOf(ValidationError);
    expect(db.updates).toEqual([]);
  });

  it.each([
    ["an actor without the HOSPITAL role", { ...owner, roles: [Role.OSM] }, {}, ForbiddenError],
    ["an ADMIN-only actor", { ...owner, roles: [Role.ADMIN] }, {}, ForbiddenError],
    ["a non-owner or other-hospital actor", owner, { owned: false }, NotFoundError],
    ["a membership revoked before the lock", owner, { locked: false }, ForbiddenError],
    ["a PUBLISHED content", owner, { status: HospitalContentStatus.PUBLISHED }, ConflictError],
  ])("rejects %s", async (_name, actor, dbOptions, errorType) => {
    const db = fakeDatabase(dbOptions);
    await expect(reorderHospitalContentImages(actor as ActorContext, { contentId, imageIds: [imageB, imageA, imageC] }, { database: db.database })).rejects.toBeInstanceOf(errorType);
    expect(db.updates).toEqual([]);
    expect(audit.recordAuditEvent).not.toHaveBeenCalled();
  });
});
