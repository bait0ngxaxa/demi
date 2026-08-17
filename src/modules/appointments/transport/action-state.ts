import type { AppointmentMutationResult } from "../services/appointment-service";

export type AppointmentActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        appointmentId: AppointmentMutationResult["appointmentId"];
        patientHospitalRelationshipId: AppointmentMutationResult["patientHospitalRelationshipId"];
        status: AppointmentMutationResult["status"];
        updatedAt: string;
      };
    };

export const initialAppointmentActionState: AppointmentActionState = { status: "IDLE" };

