import { describe, expect, it } from "vitest";

import {
  appointmentCreateRequestSchema,
  appointmentRescheduleRequestSchema,
  appointmentTransitionRequestSchema,
} from "./appointment-schemas";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";
const responsibleUserId = "44444444-4444-4444-8444-444444444444";
const updatedAt = "2026-08-17T09:00:00+07:00";

function validCreateInput(): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    scheduledAt: "2026-08-20T10:30:00+07:00",
    type: "FOLLOW_UP",
    responsibleUserId,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจ 1",
    note: "หมายเหตุสำหรับการนัดหมาย",
  };
}

describe("Appointment schemas", () => {
  it("accepts the strict provisional create shape with an offset-aware timestamp", () => {
    expect(appointmentCreateRequestSchema.safeParse(validCreateInput()).success).toBe(true);
  });

  it("rejects unknown fields and client authority fields", () => {
    for (const field of ["hospitalId", "patientId", "actorUserId", "createdByUserId", "status", "role"]) {
      expect(
        appointmentCreateRequestSchema.safeParse({ ...validCreateInput(), [field]: relationshipId }).success,
      ).toBe(false);
    }
  });

  it("rejects invalid type, timestamp without timezone, and malformed optional values", () => {
    expect(
      appointmentCreateRequestSchema.safeParse({ ...validCreateInput(), type: "SCREENING" }).success,
    ).toBe(false);
    expect(
      appointmentCreateRequestSchema.safeParse({
        ...validCreateInput(),
        scheduledAt: "2026-08-20T10:30:00",
      }).success,
    ).toBe(false);
    expect(
      appointmentCreateRequestSchema.safeParse({ ...validCreateInput(), responsibleUserId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      appointmentCreateRequestSchema.safeParse({ ...validCreateInput(), durationMinutes: 4 }).success,
    ).toBe(false);
    expect(
      appointmentCreateRequestSchema.safeParse({ ...validCreateInput(), note: 123 }).success,
    ).toBe(false);
  });

  it("keeps status out of reschedule and transition authority", () => {
    expect(
      appointmentRescheduleRequestSchema.safeParse({
        ...validCreateInput(),
        appointmentId,
        expectedUpdatedAt: updatedAt,
        status: "COMPLETED",
      }).success,
    ).toBe(false);
    expect(
      appointmentTransitionRequestSchema.safeParse({
        patientHospitalRelationshipId: relationshipId,
        appointmentId,
        expectedUpdatedAt: updatedAt,
        status: "CANCELLED",
      }).success,
    ).toBe(false);
  });
});

