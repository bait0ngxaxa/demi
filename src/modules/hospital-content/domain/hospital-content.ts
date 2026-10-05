import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";

export const HOSPITAL_CONTENT_CATEGORY_LABELS: Readonly<Record<HospitalContentCategory, string>> = {
  [HospitalContentCategory.NCD]: "NCD",
  [HospitalContentCategory.FOOD]: "อาหาร",
  [HospitalContentCategory.EXERCISE]: "การออกกำลังกาย",
  [HospitalContentCategory.OTHER]: "อื่น ๆ",
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
