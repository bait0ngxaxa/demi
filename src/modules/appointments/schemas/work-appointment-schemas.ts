import { z } from "zod";

import {
  APPOINTMENT_LOCATION_VALUES,
  APPOINTMENT_STATUS_VALUES,
} from "../domain/appointment-definitions";
import { appointmentTypeSchema } from "./appointment-schemas";

export const WORK_APPOINTMENT_PAGE_SIZE = 25;

export const workAppointmentTabSchema = z.enum([
  "UPCOMING",
  "HISTORY",
  "PENDING_REQUESTS",
]);

const optionalHospitalLocatorSchema = z
  .uuid()
  .transform((value) => value.toLowerCase())
  .optional()
  .catch(undefined);

export const workAppointmentFiltersSchema = z
  .object({
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
    type: appointmentTypeSchema.optional(),
    locationType: z.enum(APPOINTMENT_LOCATION_VALUES).optional(),
    responsibleUserId: z.uuid().transform((value) => value.toLowerCase()).optional(),
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
  });

export type WorkAppointmentTab = z.infer<typeof workAppointmentTabSchema>;
export type WorkAppointmentFilters = z.infer<typeof workAppointmentFiltersSchema>;
export type WorkAppointmentQueryInput = z.output<typeof workAppointmentQuerySchema>;
