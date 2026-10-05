import { HospitalContentCategory, HospitalContentStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getActor: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  publish: vi.fn(),
  withdraw: vi.fn(),
  archive: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: harness.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: harness.getActor }));
vi.mock("@/modules/hospital-content/services/hospital-content-service", () => ({
  createHospitalContent: harness.create,
  editHospitalContentDraft: harness.edit,
  publishHospitalContent: harness.publish,
  withdrawHospitalContent: harness.withdraw,
  archiveHospitalContent: harness.archive,
  readHospitalContentForOwner: harness.read,
  reconcileHospitalContentCreate: harness.reconcile,
}));

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { HospitalContentDetailProjection } from "@/modules/hospital-content/types/hospital-content-projections";
import { ConflictError } from "@/shared/errors/application-error";

import {
  archiveHospitalContentAction,
  createHospitalContentAction,
  editHospitalContentDraftAction,
  publishHospitalContentAction,
  readHospitalContentCurrentAction,
  reconcileHospitalContentCreateAction,
  withdrawHospitalContentAction,
} from "./server-actions";

const actor: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const hospital = { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "H001", name: "โรงพยาบาล" };
const detail: HospitalContentDetailProjection = {
  id: "22222222-2222-4222-8222-222222222222",
  hospital,
  title: "หัวข้อ",
  body: "เนื้อหา",
  category: HospitalContentCategory.OTHER,
  sourceText: null,
  status: HospitalContentStatus.DRAFT,
  firstPublishedAt: null,
  latestPublishedAt: null,
  expectedUpdatedAt: "2026-10-05T12:34:56.789Z",
};
const createInput = {
  hospitalId: hospital.id,
  submissionNonce: "55555555-5555-4555-8555-555555555555",
  title: "หัวข้อ",
  body: "เนื้อหา",
  category: "OTHER",
  sourceText: null,
};
const lifecycleInput = { contentId: detail.id, expectedUpdatedAt: detail.expectedUpdatedAt };

describe("Hospital Content Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.getActor.mockResolvedValue(actor);
    harness.create.mockResolvedValue({ outcome: "CREATED", content: detail });
    harness.edit.mockResolvedValue({ outcome: "UPDATED", content: detail });
    harness.publish.mockResolvedValue({ outcome: "PUBLISHED", content: { ...detail, status: HospitalContentStatus.PUBLISHED } });
    harness.withdraw.mockResolvedValue({ outcome: "WITHDRAWN", content: detail });
    harness.archive.mockResolvedValue({ outcome: "ARCHIVED", content: { ...detail, status: HospitalContentStatus.ARCHIVED } });
    harness.read.mockResolvedValue(detail);
    harness.reconcile.mockResolvedValue({ status: "ABSENT" });
  });

  it("revalidates and returns CREATED after confirmed create, while malformed payloads stop before persistence", async () => {
    const result = await createHospitalContentAction(createInput);
    expect(result).toEqual({ status: "SUCCESS", result: { outcome: "CREATED", content: detail } });
    expect(harness.create).toHaveBeenCalledWith(actor, createInput);
    expect(harness.revalidatePath).toHaveBeenCalledWith("/app/hospitals/knowledge");

    vi.clearAllMocks();
    harness.getActor.mockResolvedValue(actor);
    const invalid = await createHospitalContentAction({ ...createInput, body: "PRIVATE ARTICLE", clientActor: actor.userId });
    expect(invalid).toMatchObject({ status: "ERROR", code: "VALIDATION" });
    expect(JSON.stringify(invalid)).not.toContain("PRIVATE ARTICLE");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("resolves every lifecycle action through its dedicated service and does not accept hidden edit state", async () => {
    await expect(editHospitalContentDraftAction({
      ...lifecycleInput,
      title: "หัวข้อใหม่",
      body: "เนื้อหา",
      category: "OTHER",
      sourceText: null,
      status: "PUBLISHED",
    })).resolves.toMatchObject({ status: "ERROR", code: "VALIDATION" });
    expect(harness.edit).not.toHaveBeenCalled();

    await publishHospitalContentAction(lifecycleInput);
    await withdrawHospitalContentAction(lifecycleInput);
    await archiveHospitalContentAction(lifecycleInput);
    expect(harness.publish).toHaveBeenCalledWith(actor, lifecycleInput);
    expect(harness.withdraw).toHaveBeenCalledWith(actor, lifecycleInput);
    expect(harness.archive).toHaveBeenCalledWith(actor, lifecycleInput);
  });

  it("uses fresh actor resolution for read, reconciliation and mutations and returns minimized sanitized errors", async () => {
    await readHospitalContentCurrentAction(detail.id);
    await reconcileHospitalContentCreateAction({ hospitalId: hospital.id, submissionNonce: createInput.submissionNonce });
    await publishHospitalContentAction(lifecycleInput);
    expect(harness.getActor).toHaveBeenCalledTimes(3);
    expect(harness.read).toHaveBeenCalledWith(actor, detail.id);
    expect(harness.reconcile).toHaveBeenCalledWith(actor, { hospitalId: hospital.id, submissionNonce: createInput.submissionNonce });

    harness.edit.mockRejectedValueOnce(new ConflictError("PRIVATE ARTICLE BODY"));
    const conflicted = await editHospitalContentDraftAction({ ...lifecycleInput, title: "x", body: "PRIVATE ARTICLE BODY", category: "NCD", sourceText: null });
    expect(conflicted).toMatchObject({ status: "ERROR", code: "CONFLICT" });
    expect(JSON.stringify(conflicted)).not.toContain("PRIVATE ARTICLE BODY");
  });
});
