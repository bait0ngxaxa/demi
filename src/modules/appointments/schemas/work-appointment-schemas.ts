import { z } from "zod";

import { pageNumberSchema } from "@/shared/pagination/page-number";
import { assigneeSearchTermSchema } from "@/shared/search/assignee-search";

import {
  APPOINTMENT_LOCATION_VALUES,
  APPOINTMENT_STATUS_VALUES,
} from "../domain/appointment-definitions";
import { APPOINTMENT_REQUEST_KINDS } from "../domain/appointment-request-kinds";
import { appointmentTypeSchema } from "./appointment-schemas";

export const WORK_APPOINTMENT_PAGE_SIZE = 25;

export const workAppointmentTabSchema = z.enum([
  "UPCOMING",
  "HISTORY",
  "PENDING_REQUESTS",
  "AWAITING_MY_ACCEPTANCE",
]);

const optionalHospitalLocatorSchema = z
  .uuid()
  .transform((value) => value.toLowerCase())
  .optional()
  .catch(undefined);

/** PENDING_REQUESTS only: narrows the queue to one request kind. An invalid value is ignored, never an error. */
const optionalRequestTypeSchema = z.enum(APPOINTMENT_REQUEST_KINDS).optional().catch(undefined);

export const workAppointmentFiltersSchema = z
  .object({
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
    type: appointmentTypeSchema.optional(),
    locationType: z.enum(APPOINTMENT_LOCATION_VALUES).optional(),
    responsibleUserId: z.uuid().transform((value) => value.toLowerCase()).optional(),
    awaitingOsmAcceptance: z.literal("true").optional(),
    unassignedOsm: z.literal("true").optional(),
    /** Future SCHEDULED appointments with neither a responsible staff member nor an assigned อสม. */
    unassigned: z.literal("true").optional(),
    requestType: z.enum(APPOINTMENT_REQUEST_KINDS).optional(),
  })
  .strict()
  .superRefine((filters, context) => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "End date must be on or after start date",
      });
    }
  });

export const workAppointmentQuerySchema = z
  .object({
    hospitalId: optionalHospitalLocatorSchema,
    tab: workAppointmentTabSchema.catch("UPCOMING"),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
    type: appointmentTypeSchema.optional(),
    locationType: z.enum(APPOINTMENT_LOCATION_VALUES).optional(),
    responsibleUserId: z.uuid().transform((value) => value.toLowerCase()).optional(),
    awaitingOsmAcceptance: z.literal("true").optional(),
    unassignedOsm: z.literal("true").optional(),
    unassigned: z.literal("true").optional(),
    requestType: optionalRequestTypeSchema,
    cursor: z.string().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "End date must be on or after start date",
      });
    }
  })
  // The request-kind filter exists only on PENDING_REQUESTS; other tabs drop it rather than fail.
  .transform(({ requestType, ...input }) => ({
    ...input,
    ...(input.tab === "PENDING_REQUESTS" && requestType !== undefined ? { requestType } : {}),
  }));

export type WorkAppointmentTab = z.infer<typeof workAppointmentTabSchema>;
export type WorkAppointmentFilters = z.infer<typeof workAppointmentFiltersSchema>;
export type WorkAppointmentQueryInput = z.output<typeof workAppointmentQuerySchema>;

/** One page of the list's responsible-person filter search, for one selected work Hospital. */
export const workAppointmentResponsibleSearchSchema = z
  .object({
    hospitalId: z.uuid().transform((value) => value.toLowerCase()),
    value: assigneeSearchTermSchema,
    page: pageNumberSchema,
  })
  .strict();
