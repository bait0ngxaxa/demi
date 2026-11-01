import { z } from "zod";

export const hospitalReportHospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

export type HospitalReportTargetSelection =
  | { kind: "DIRECT_OWNER"; hospitalId: string }
  | { kind: "PARENT_CHILD"; parentHospitalId: string; hospitalId: string };

export function parseHospitalReportTargetSelection(value: unknown): HospitalReportTargetSelection | null {
  const parsedToken = z.string().trim().min(1).max(128).safeParse(value);
  if (!parsedToken.success) return null;

  const parts = parsedToken.data.split(":");
  if (parts[0] === "DIRECT_OWNER" && parts.length === 2) {
    const hospitalId = hospitalReportHospitalIdSchema.safeParse(parts[1]);
    return hospitalId.success ? { kind: "DIRECT_OWNER", hospitalId: hospitalId.data } : null;
  }

  if (parts[0] === "PARENT_CHILD" && parts.length === 3) {
    const parentHospitalId = hospitalReportHospitalIdSchema.safeParse(parts[1]);
    const hospitalId = hospitalReportHospitalIdSchema.safeParse(parts[2]);
    if (!parentHospitalId.success || !hospitalId.success || parentHospitalId.data === hospitalId.data) return null;
    return { kind: "PARENT_CHILD", parentHospitalId: parentHospitalId.data, hospitalId: hospitalId.data };
  }

  return null;
}

export const parentChildHospitalReportRequestSchema = z
  .object({
    parentHospitalId: hospitalReportHospitalIdSchema,
    hospitalId: hospitalReportHospitalIdSchema,
  })
  .strict()
  .refine(({ parentHospitalId, hospitalId }) => parentHospitalId !== hospitalId);

const cursorSchema = z.string().trim().min(1).max(1024).optional();

/**
 * Phase F (ก-18): the default cohort excludes Patients whose care with the Hospital ended; the OWNER may opt in to
 * "รวมผู้ที่สิ้นสุดการดูแล" so Programs completed before the end stay reportable. Omitted means ACTIVE.
 */
export const hospitalReportCohortSchema = z.enum(["ACTIVE", "INCLUDE_ENDED"]);
export type HospitalReportCohort = z.infer<typeof hospitalReportCohortSchema>;

export const hospitalReportFiltersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  progress: z.enum(["", "0", "1", "2", "3", "4", "5", "6", "AFTER_RECORDED", "COMPLETED"]).default(""),
  status: z.enum(["", "ACTIVE", "COMPLETED"]).default(""),
}).strict();
export type HospitalReportFilters = z.infer<typeof hospitalReportFiltersSchema>;

export const hospitalReportPageRequestSchema = z
  .object({
    hospitalId: hospitalReportHospitalIdSchema,
    ...hospitalReportFiltersSchema.shape,
    cursor: cursorSchema,
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
    cohort: hospitalReportCohortSchema.optional(),
  })
  .strict();

export const hospitalReportExportRequestSchema = z
  .object({ hospitalId: hospitalReportHospitalIdSchema, cohort: hospitalReportCohortSchema.optional() })
  .strict();

/** ADR-0025: the most Hospitals one network export request may name; "ALL" expands on the server. */
export const NETWORK_REPORT_EXPORT_MAX_HOSPITALS = 200;

export const networkReportHospitalSelectionSchema = z.union([
  z.literal("ALL"),
  z.array(hospitalReportHospitalIdSchema)
    .min(1)
    .max(NETWORK_REPORT_EXPORT_MAX_HOSPITALS)
    .transform((hospitalIds) => [...new Set(hospitalIds)]),
]);

export const networkReportExportRequestSchema = z
  .object({
    parentHospitalId: hospitalReportHospitalIdSchema,
    hospitalIds: networkReportHospitalSelectionSchema,
    cohort: hospitalReportCohortSchema.optional(),
  })
  .strict();

export const networkReportExportPreviewRequestSchema = z
  .object({ parentHospitalId: hospitalReportHospitalIdSchema, cohort: hospitalReportCohortSchema.optional() })
  .strict();

const NETWORK_REPORT_EXPORT_QUERY_KEYS = new Set(["parentHospitalId", "hospitalId", "scope", "cohort"]);

/**
 * Strict query for `GET /api/v1/hospital/reporting/network/export`: one parentHospitalId, then either
 * `scope=ALL` or one or more `hospitalId`, never both; at most one cohort; no other keys.
 */
export function parseNetworkReportExportQuery(searchParams: URLSearchParams): NetworkReportExportRequest | null {
  const scopes = searchParams.getAll("scope");
  const hospitalIds = searchParams.getAll("hospitalId");
  const cohorts = searchParams.getAll("cohort");
  if (
    [...searchParams.keys()].some((key) => !NETWORK_REPORT_EXPORT_QUERY_KEYS.has(key)) ||
    searchParams.getAll("parentHospitalId").length !== 1 ||
    cohorts.length > 1 ||
    scopes.length > 1 ||
    (scopes.length === 1) === (hospitalIds.length > 0)
  ) {
    return null;
  }
  if (scopes.length === 1 && scopes[0] !== "ALL") return null;

  const parsed = networkReportExportRequestSchema.safeParse({
    parentHospitalId: searchParams.get("parentHospitalId"),
    hospitalIds: scopes.length === 1 ? "ALL" : hospitalIds,
    ...(cohorts.length === 1 ? { cohort: cohorts[0] } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export type HospitalReportPageRequest = z.infer<typeof hospitalReportPageRequestSchema>;
export type NetworkReportExportRequest = z.infer<typeof networkReportExportRequestSchema>;
export type NetworkReportExportPreviewRequest = z.infer<typeof networkReportExportPreviewRequestSchema>;
export type HospitalReportExportRequest = z.infer<typeof hospitalReportExportRequestSchema>;
