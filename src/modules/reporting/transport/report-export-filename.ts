/** Restrict a value used in a Content-Disposition filename to ASCII-safe characters. */
export function safeReportFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "hospital";
}
