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

export type AppointmentInteractionActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
      message: string;
      loginHref?: string;
    }
  | {
      status: "SUCCESS";
      operation:
        | "ACKNOWLEDGED"
        | "ASSIGNMENT_ACCEPTED"
        | "CANCELLATION_REQUESTED"
        | "COORDINATION_RECORDED"
        | "CANCELLATION_APPROVED"
        | "CANCELLATION_REJECTED"
        | "CANCELLATION_SUPERSEDED";
      appointmentId: string;
      patientHospitalRelationshipId: string;
      appointmentStatus?: AppointmentMutationResult["status"];
      updatedAt?: string;
    };

export const initialAppointmentActionState: AppointmentActionState = { status: "IDLE" };
export const initialAppointmentInteractionActionState: AppointmentInteractionActionState = { status: "IDLE" };

