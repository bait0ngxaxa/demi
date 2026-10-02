import { z } from "zod";

export const appointmentGrantIdSchema = z.string().uuid().transform((id) => id.toLowerCase());
export const proposeAppointmentGrantSchema = z.object({
  caregiverRelationshipId: appointmentGrantIdSchema,
  patientHospitalRelationshipId: appointmentGrantIdSchema,
}).strict();
export const delegatedAppointmentListSchema = z.object({
  grantId: appointmentGrantIdSchema,
  cursor: appointmentGrantIdSchema.optional(),
}).strict();
export const appointmentGrantManagementSchema = z.object({
  patientGrantsCursor: appointmentGrantIdSchema.optional(),
  caregiverGrantsCursor: appointmentGrantIdSchema.optional(),
  hospitalsCursor: appointmentGrantIdSchema.optional(),
}).strict();
