import { z } from "zod";

/** A 1-based page of a counted list; `page` is already clamped to `1..totalPages`. */
export type PageNumberPosition = {
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

/** 1-based page number; a page past the last one is clamped by the service. */
export const pageNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .refine(Number.isSafeInteger, "Page must be a safe integer")
  .default(1);

/** Clamps a requested page to the last page (page 1 when nothing matches) so rows and count agree. */
export function resolvePagePosition(
  requestedPage: number,
  total: number,
  pageSize: number,
): PageNumberPosition & { skip: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  return {
    page,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    skip: (page - 1) * pageSize,
  };
}

/** A missing or malformed `page` search parameter opens the first page; the service clamps a page past the end. */
export function parsePageSearchParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw === undefined || !/^[1-9]\d*$/u.test(raw)) {
    return 1;
  }

  const page = Number(raw);
  return Number.isSafeInteger(page) ? page : 1;
}
