import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";

export const HOSPITAL_CONTENT_CATEGORY_LABELS: Readonly<Record<HospitalContentCategory, string>> = {
  [HospitalContentCategory.NCD]: "NCD",
  [HospitalContentCategory.FOOD]: "อาหาร",
  [HospitalContentCategory.EXERCISE]: "การออกกำลังกาย",
  [HospitalContentCategory.OTHER]: "อื่น ๆ",
  [HospitalContentCategory.NEWS]: "ข่าวสาร",
};

export const HOSPITAL_CONTENT_STATUS_LABELS: Readonly<Record<HospitalContentStatus, string>> = {
  [HospitalContentStatus.DRAFT]: "ฉบับร่าง",
  [HospitalContentStatus.PUBLISHED]: "เผยแพร่แล้ว",
  [HospitalContentStatus.ARCHIVED]: "เก็บถาวร",
};

export const HOSPITAL_CONTENT_STATUS_VARIANTS = {
  [HospitalContentStatus.DRAFT]: "warning",
  [HospitalContentStatus.PUBLISHED]: "success",
  [HospitalContentStatus.ARCHIVED]: "neutral",
} as const;

export const HOSPITAL_CONTENT_PAGE_SIZE = 25;
export const HOSPITAL_CONTENT_CURSOR_LOOKAHEAD = HOSPITAL_CONTENT_PAGE_SIZE + 1;
export const HOSPITAL_CONTENT_IMAGE_LIMIT = 3;
export const HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE = "เนื้อหาหนึ่งรายการแนบรูปได้ไม่เกิน 3 รูป กรุณาลบรูปที่เกินก่อน";
// The database CHECK keeps sortOrder within 0..4, which bounds the stored images (and the spare slot used to reorder).
export const HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER = 4;
export const HOSPITAL_CONTENT_IMAGE_URL_TTL_SECONDS = 300;
export const HOSPITAL_CONTENT_REQUEST_MAX_BYTES = 131_072;
export const HOSPITAL_CONTENT_TITLE_MAX_CODE_UNITS = 200;
export const HOSPITAL_CONTENT_BODY_MAX_CODE_UNITS = 20_000;
export const HOSPITAL_CONTENT_SOURCE_MAX_CODE_UNITS = 1_000;
export const HOSPITAL_CONTENT_RAW_TITLE_MAX_CODE_UNITS = 1_000;
export const HOSPITAL_CONTENT_RAW_BODY_MAX_CODE_UNITS = 24_000;
export const HOSPITAL_CONTENT_RAW_SOURCE_MAX_CODE_UNITS = 2_000;

export function nextHospitalContentVersion(now: Date, previous: Date): Date {
  const nowMs = now.getTime();
  const previousMs = previous.getTime();
  const nextMs = Math.max(nowMs, previousMs + 1);

  if (!Number.isFinite(nowMs) || !Number.isFinite(previousMs) || !Number.isFinite(nextMs)) {
    throw new RangeError("Hospital Content version time is invalid");
  }

  const next = new Date(nextMs);

  if (!Number.isFinite(next.getTime())) {
    throw new RangeError("Hospital Content version time is invalid");
  }

  return next;
}

export type HospitalContentPublicationTimes = {
  firstPublishedAt: Date;
  latestPublishedAt: Date;
};

export function hospitalContentPublicationTimes(
  firstPublishedAt: Date | null,
  latestPublishedAt: Date | null,
  eventTime: Date,
): HospitalContentPublicationTimes {
  const eventMs = eventTime.getTime();

  if (!Number.isFinite(eventMs)) {
    throw new RangeError("Hospital Content publication time is invalid");
  }

  if (firstPublishedAt === null && latestPublishedAt === null) {
    const instant = new Date(eventMs);
    return { firstPublishedAt: instant, latestPublishedAt: new Date(eventMs) };
  }

  if (firstPublishedAt === null || latestPublishedAt === null) {
    throw new RangeError("Hospital Content publication timestamps are inconsistent");
  }

  const firstMs = firstPublishedAt.getTime();
  const latestMs = latestPublishedAt.getTime();

  if (!Number.isFinite(firstMs) || !Number.isFinite(latestMs) || firstMs > latestMs || eventMs < latestMs) {
    throw new RangeError("Hospital Content publication clock moved backward");
  }

  return {
    firstPublishedAt: new Date(firstMs),
    latestPublishedAt: new Date(eventMs),
  };
}

export const hospitalContentDomainInternals = {
  HOSPITAL_CONTENT_PAGE_SIZE,
  HOSPITAL_CONTENT_CURSOR_LOOKAHEAD,
  HOSPITAL_CONTENT_REQUEST_MAX_BYTES,
};

export type HospitalContentImageMove = { imageId: string; sortOrder: number };

/**
 * Orders single-row `sortOrder` updates so the non-deferrable unique (contentId, sortOrder) index is
 * never violated: the first free slot above the stored images is the spare that breaks each cycle.
 */
export function planHospitalContentImageReorder(current: readonly string[], desired: readonly string[]): HospitalContentImageMove[] {
  if (current.length !== desired.length || new Set(desired).size !== desired.length || desired.some((id) => !current.includes(id))) {
    throw new RangeError("Hospital Content image order is not a permutation of the stored images");
  }
  const spare = current.length;
  if (spare > HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER) throw new RangeError("No spare image slot is available");
  const slotOf = new Map(current.map((id, index) => [id, index] as const));
  const moves: HospitalContentImageMove[] = [];
  const done = new Set<string>();
  for (const [targetSlot, startId] of desired.entries()) {
    if (done.has(startId)) continue;
    done.add(startId);
    if (slotOf.get(startId) === targetSlot) continue;
    // Park the first mover in the spare slot, then pull each displaced row into the slot freed before it.
    moves.push({ imageId: startId, sortOrder: spare });
    let freed = slotOf.get(startId) as number;
    while (freed !== targetSlot) {
      const occupantId = desired[freed] as string;
      moves.push({ imageId: occupantId, sortOrder: freed });
      done.add(occupantId);
      freed = slotOf.get(occupantId) as number;
    }
    moves.push({ imageId: startId, sortOrder: targetSlot });
  }
  return moves;
}
