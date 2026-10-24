import "server-only";

import { randomUUID } from "node:crypto";
import { HospitalContentStatus, HospitalStatus, MembershipStatus, MembershipType, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { getPatientEvidenceStorage } from "@/modules/patient-evidence/storage/supabase-patient-evidence-storage";
import type { PatientEvidenceStorage } from "@/modules/patient-evidence/storage/patient-evidence-storage";
import { NORMALIZED_UPLOAD_MAX_BYTES } from "@/modules/patient-evidence/policies/patient-evidence-image-policy";
import { validatePatientEvidenceFile, type ValidatedPatientEvidenceFile } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { hospitalContentLocatorSchema } from "../schemas/hospital-content-schemas";
import { HOSPITAL_CONTENT_IMAGE_LIMIT, HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE, HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER, HOSPITAL_CONTENT_IMAGE_URL_TTL_SECONDS, planHospitalContentImageReorder } from "../domain/hospital-content";

type Database = PrismaClient;
function assertOwner(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.HOSPITAL)) throw new ForbiddenError();
}

const replayIdentitySelect = { id: true, contentSha256: true, mediaType: true, byteSize: true } as const;

// A nonce replays only the exact stored payload; a row without a fingerprint can never be proven identical.
function confirmReplay(existing: { id: string; contentSha256: string | null; mediaType: string; byteSize: number }, file: ValidatedPatientEvidenceFile): { imageId: string; replay: true } {
  if (existing.contentSha256 === null || existing.contentSha256 !== file.contentSha256 || existing.mediaType !== file.mediaType || existing.byteSize !== file.byteSize) throw new ConflictError();
  return { imageId: existing.id, replay: true };
}

type LockedOwnedContent = { id: string; hospitalId: string; status: HospitalContentStatus };

// Re-checks OWNER + ACTIVE hospital + ACTIVE user inside the transaction and locks the content row.
async function lockOwnedContent(tx: Prisma.TransactionClient, actor: ActorContext, contentId: string): Promise<LockedOwnedContent> {
  const current = await tx.$queryRaw<LockedOwnedContent[]>(Prisma.sql`
    SELECT c."id", c."hospitalId", c."status"
    FROM "HospitalContent" c
    JOIN "Hospital" h ON h."id" = c."hospitalId" AND h."status" = 'ACTIVE'::"HospitalStatus"
    JOIN "HospitalMembership" m ON m."hospitalId" = h."id" AND m."userId" = ${actor.userId}::uuid AND m."membershipType" = 'OWNER'::"MembershipType" AND m."status" = 'ACTIVE'::"MembershipStatus"
    JOIN "User" u ON u."id" = m."userId" AND u."personId" = ${actor.personId}::uuid AND u."status" = 'ACTIVE'::"UserStatus"
    JOIN "UserRole" r ON r."userId" = u."id" AND r."role" = 'HOSPITAL'::"Role"
    WHERE c."id" = ${contentId}::uuid
    FOR UPDATE OF c
  `);
  const locked = current[0];
  if (!locked) throw new ForbiddenError();
  return locked;
}

export async function uploadHospitalContentImage(actor: ActorContext | null | undefined, input: {
  contentId: unknown; uploadNonce: unknown; bytes: Uint8Array; declaredMediaType: string;
}, dependencies: { database?: Database; storage?: PatientEvidenceStorage; now?: () => Date; imageIdFactory?: () => string } = {}): Promise<{ imageId: string; replay: boolean }> {
  assertOwner(actor);
  const parsedContent = hospitalContentLocatorSchema.safeParse(input.contentId);
  if (!parsedContent.success || typeof input.uploadNonce !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.uploadNonce)) throw new ValidationError();
  const db = dependencies.database ?? getPrisma();
  const content = await db.hospitalContent.findFirst({ where: { id: parsedContent.data, hospital: { status: HospitalStatus.ACTIVE, memberships: { some: { userId: actor.userId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } } } }, select: { id: true, hospitalId: true, status: true } });
  if (!content) throw new NotFoundError();
  if (content.status !== HospitalContentStatus.DRAFT) throw new ConflictError();
  const file = validatePatientEvidenceFile({ bytes: input.bytes, declaredMediaType: input.declaredMediaType });
  const replay = await db.hospitalContentImage.findFirst({ where: { contentId: content.id, uploadNonce: input.uploadNonce }, select: replayIdentitySelect });
  if (replay) return confirmReplay(replay, file);
  const imageId = dependencies.imageIdFactory?.() ?? randomUUID();
  const objectKey = `hospital-content/${content.hospitalId}/${content.id}/${imageId}`;
  const storage = dependencies.storage ?? getPatientEvidenceStorage();
  await storage.uploadObject({ objectKey, bytes: file.bytes, mediaType: file.mediaType });
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) { await storage.removeObject({ objectKey }); throw new InfrastructureError(); }
  try {
    const result = await db.$transaction(async (tx) => {
      const currentContent = await lockOwnedContent(tx, actor, content.id);
      if (currentContent.status !== HospitalContentStatus.DRAFT) throw new ConflictError();
      const existing = await tx.hospitalContentImage.findFirst({ where: { contentId: content.id, uploadNonce: input.uploadNonce as string }, select: replayIdentitySelect });
      if (existing) return confirmReplay(existing, file);
      const count = await tx.hospitalContentImage.count({ where: { contentId: content.id } });
      if (count >= HOSPITAL_CONTENT_IMAGE_LIMIT) throw new ValidationError(HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE);
      const image = await tx.hospitalContentImage.create({ data: { id: imageId, contentId: content.id, uploadNonce: input.uploadNonce as string, storageObjectKey: objectKey, mediaType: file.mediaType, byteSize: file.byteSize, contentSha256: file.contentSha256, sortOrder: count, createdAt: now }, select: { id: true } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_content.image_added", resourceType: "HospitalContentImage", resourceId: image.id, metadata: { contentId: content.id, hospitalId: content.hospitalId } }, tx);
      return { imageId: image.id, replay: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (result.replay) await storage.removeObject({ objectKey });
    return result;
  } catch (error: unknown) {
    try { await storage.removeObject({ objectKey }); } catch { console.error("hospital_content_image_upload_compensation_failed", { imageId }); }
    if (error instanceof ForbiddenError || error instanceof ConflictError || error instanceof ValidationError || error instanceof NotFoundError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError();
    throw new InfrastructureError("Hospital content image could not be saved");
  }
}

const imageMutationErrors = [ForbiddenError, ConflictError, ValidationError, NotFoundError];

function rethrowImageMutationError(error: unknown): never {
  if (imageMutationErrors.some((known) => error instanceof known)) throw error;
  throw new InfrastructureError("Hospital content images could not be saved");
}

async function readOrderedImages(tx: Prisma.TransactionClient, contentId: string): Promise<Array<{ id: string; sortOrder: number; storageObjectKey: string }>> {
  return tx.hospitalContentImage.findMany({ where: { contentId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, sortOrder: true, storageObjectKey: true } });
}

async function assertOwnerCanSeeContent(db: Database, actor: ActorContext, contentId: string): Promise<void> {
  const owned = await db.hospitalContent.findFirst({ where: { id: contentId, hospital: { status: HospitalStatus.ACTIVE, memberships: { some: { userId: actor.userId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } } } }, select: { id: true } });
  if (!owned) throw new NotFoundError();
}

/** Direct OWNER removes one image of a DRAFT; remaining images keep a contiguous sortOrder. */
export async function removeHospitalContentImage(actor: ActorContext | null | undefined, input: { contentId: unknown; imageId: unknown }, dependencies: { database?: Database; storage?: PatientEvidenceStorage } = {}): Promise<{ imageIds: string[] }> {
  assertOwner(actor);
  const parsedContent = hospitalContentLocatorSchema.safeParse(input.contentId);
  const parsedImage = hospitalContentLocatorSchema.safeParse(input.imageId);
  if (!parsedContent.success || !parsedImage.success) throw new ValidationError();
  const db = dependencies.database ?? getPrisma();
  await assertOwnerCanSeeContent(db, actor, parsedContent.data);
  let removed: { removedObjectKey: string; imageIds: string[] };
  try {
    removed = await db.$transaction(async (tx) => {
      const content = await lockOwnedContent(tx, actor, parsedContent.data);
      if (content.status !== HospitalContentStatus.DRAFT) throw new ConflictError();
      const images = await readOrderedImages(tx, content.id);
      const target = images.find(({ id }) => id === parsedImage.data);
      if (!target) throw new NotFoundError();
      await tx.hospitalContentImage.delete({ where: { id: target.id } });
      // Ascending renumbering only ever moves a row into the slot freed just before it.
      const remaining = images.filter(({ id }) => id !== target.id);
      for (const [index, image] of remaining.entries()) {
        if (image.sortOrder !== index) await tx.hospitalContentImage.update({ where: { id: image.id }, data: { sortOrder: index } });
      }
      await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_content.image_removed", resourceType: "HospitalContentImage", resourceId: target.id, metadata: { contentId: content.id, hospitalId: content.hospitalId } }, tx);
      return { removedObjectKey: target.storageObjectKey, imageIds: remaining.map(({ id }) => id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    rethrowImageMutationError(error);
  }
  const storage = dependencies.storage ?? getPatientEvidenceStorage();
  // The row is already gone; an orphaned object is logged for cleanup rather than failing the committed removal.
  try { await storage.removeObject({ objectKey: removed.removedObjectKey }); } catch { console.error("hospital_content_image_remove_compensation_failed", { imageId: parsedImage.data }); }
  return { imageIds: removed.imageIds };
}

/** Direct OWNER sets the full image order of a DRAFT; `imageIds` must be exactly the stored images. */
export async function reorderHospitalContentImages(actor: ActorContext | null | undefined, input: { contentId: unknown; imageIds: unknown }, dependencies: { database?: Database } = {}): Promise<{ imageIds: string[] }> {
  assertOwner(actor);
  const parsedContent = hospitalContentLocatorSchema.safeParse(input.contentId);
  if (!parsedContent.success || !Array.isArray(input.imageIds) || input.imageIds.length > HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER + 1) throw new ValidationError();
  const desired: string[] = [];
  for (const value of input.imageIds as unknown[]) {
    const parsed = hospitalContentLocatorSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError();
    desired.push(parsed.data);
  }
  const db = dependencies.database ?? getPrisma();
  await assertOwnerCanSeeContent(db, actor, parsedContent.data);
  try {
    return await db.$transaction(async (tx) => {
      const content = await lockOwnedContent(tx, actor, parsedContent.data);
      if (content.status !== HospitalContentStatus.DRAFT) throw new ConflictError();
      const stored = (await readOrderedImages(tx, content.id)).map(({ id }) => id);
      // A stale client (an image added or removed elsewhere) must reload instead of guessing an order.
      if (stored.length !== desired.length || new Set(desired).size !== desired.length || desired.some((id) => !stored.includes(id))) throw new ConflictError();
      if (stored.every((id, index) => id === desired[index])) return { imageIds: stored };
      let moves: ReturnType<typeof planHospitalContentImageReorder>;
      // Only a legacy draft holding more images than the limit has no spare slot; it must remove images first.
      try { moves = planHospitalContentImageReorder(stored, desired); } catch { throw new ValidationError(HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE); }
      for (const move of moves) await tx.hospitalContentImage.update({ where: { id: move.imageId }, data: { sortOrder: move.sortOrder } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_content.images_reordered", resourceType: "HospitalContent", resourceId: content.id, metadata: { hospitalId: content.hospitalId } }, tx);
      return { imageIds: desired };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    return rethrowImageMutationError(error);
  }
}

export async function getHospitalContentImageSignedUrl(actor: ActorContext | null | undefined, imageId: unknown, dependencies: { database?: Database; storage?: PatientEvidenceStorage } = {}): Promise<string> {
  if (!actor) throw new ForbiddenError();
  if (typeof imageId !== "string" || !/^[0-9a-f-]{36}$/i.test(imageId)) throw new NotFoundError();
  const db = dependencies.database ?? getPrisma();
  const image = await db.hospitalContentImage.findUnique({ where: { id: imageId }, select: { storageObjectKey: true, content: { select: { id: true, hospitalId: true, status: true } } } });
  if (!image) throw new NotFoundError();
  const { content } = image;
  const hospital = await db.hospital.findFirst({ where: { id: content.hospitalId, status: HospitalStatus.ACTIVE }, select: { id: true } });
  if (!hospital) throw new NotFoundError();
  let allowed = false;
  if (content.status === HospitalContentStatus.PUBLISHED) {
    if (actor.roles.includes(Role.PATIENT)) allowed = Boolean(await db.patientHospitalRelationship.findFirst({ where: { hospitalId: content.hospitalId, ...activePatientHospitalRelationshipWhere, patientProfile: { person: { id: actor.personId, user: { id: actor.userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } } } } }, select: { id: true } }));
    if (!allowed && actor.roles.includes(Role.HOSPITAL)) allowed = Boolean(await db.hospitalMembership.findFirst({ where: { hospitalId: content.hospitalId, userId: actor.userId, status: MembershipStatus.ACTIVE, user: { personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } }, select: { id: true } }));
    if (!allowed && actor.roles.includes(Role.OSM)) allowed = Boolean(await db.osmHospitalRelationship.findFirst({ where: { hospitalId: content.hospitalId, userId: actor.userId, status: MembershipStatus.ACTIVE, user: { personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.OSM } } } }, select: { id: true } }));
  } else if (content.status === HospitalContentStatus.DRAFT && actor.roles.includes(Role.HOSPITAL)) {
    allowed = Boolean(await db.hospitalMembership.findFirst({ where: { hospitalId: content.hospitalId, userId: actor.userId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE, user: { personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } }, select: { id: true } }));
  }
  if (!allowed) throw new NotFoundError();
  const storage = dependencies.storage ?? getPatientEvidenceStorage();
  return storage.createTemporaryAccessUrl({ objectKey: image.storageObjectKey, expiresInSeconds: HOSPITAL_CONTENT_IMAGE_URL_TTL_SECONDS });
}

export const hospitalContentImageInternals = { NORMALIZED_UPLOAD_MAX_BYTES };
