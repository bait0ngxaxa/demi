export type PageNumberToken = number | "ellipsis-start" | "ellipsis-end";

/** Bounded presentation only; the data service remains responsible for page boundaries. */
export function normalizePageNumbers(page: number, totalPages: number): { page: number; totalPages: number } {
  const total = Number.isSafeInteger(totalPages) && totalPages > 0 ? totalPages : 0;
  const current = Number.isSafeInteger(page) ? page : 1;
  return { page: Math.max(1, Math.min(current, total)), totalPages: total };
}

/** Always includes both ends; a single omitted page is shown instead of an ellipsis. */
export function getPageNumberTokens(page: number, totalPages: number, compact = false): PageNumberToken[] {
  const position = normalizePageNumbers(page, totalPages);
  if (position.totalPages === 0) return [];
  const radius = compact ? 0 : 2;
  const pages = new Set([1, position.totalPages]);
  if (position.totalPages <= (compact ? 5 : 7)) {
    for (let value = 1; value <= position.totalPages; value += 1) pages.add(value);
  } else {
    const start = Math.max(2, Math.min(position.page - radius, position.totalPages - radius * 2 - 1));
    const end = Math.min(position.totalPages - 1, Math.max(position.page + radius, 2 + radius * 2));
    for (let value = start; value <= end; value += 1) pages.add(value);
  }
  const tokens: PageNumberToken[] = [];
  let previous = 0;
  for (const value of [...pages].sort((a, b) => a - b)) {
    if (value - previous === 2) tokens.push(previous + 1);
    else if (value - previous > 2) tokens.push(previous === 1 ? "ellipsis-start" : "ellipsis-end");
    tokens.push(value);
    previous = value;
  }
  return tokens;
}
