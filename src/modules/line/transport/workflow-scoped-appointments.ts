import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import type { PatientAppointmentRescheduleRequest } from "@prisma/client";

import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import {
  getOwnPatientAppointmentDetail,
  getOwnPatientAppointmentHistory,
  type PatientSelfAppointmentDetail,
  type PatientSelfAppointmentHistory,
} from "@/modules/patient-self/services/patient-self-care-query-service";
import {
  listOwnPatientRelationshipNavigation,
  type PatientSelfRelationshipNavigation,
} from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { LineWorkflowFailure, type LineWorkflowFailureCode } from "../domain/line-workflow-errors";
import { LINE_WORKFLOW_CONTEXT_COOKIE_NAME } from "../services/line-workflow-context";
import { runLineWorkflowScopedRead, type LineWorkflowScopedSnapshot } from "../services/line-workflow-service";

/** Safe UI classification; carries no identity, locator or provider detail. */
export type LineWorkflowScopedFailureState =
  | "NOT_ACTIVATED"
  | "SCOPE_MISSING"
  | "SCOPE_EXPIRED"
  | "SCOPE_REVOKED"
  | "SESSION_MISMATCH"
  | "LOGIN_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INELIGIBLE"
  | "RESOURCE_INVALID"
  | "TEMPORARILY_UNAVAILABLE";

export type LineWorkflowScopedResult<T> =
  | { status: "AUTHORIZED"; data: T }
  | { status: "DENIED"; state: LineWorkflowScopedFailureState };

const failureStates: Partial<Record<LineWorkflowFailureCode, LineWorkflowScopedFailureState>> = {
  WORKFLOW_DISABLED: "NOT_ACTIVATED",
  MINI_CONFIGURATION_UNAVAILABLE: "NOT_ACTIVATED",
  LIFECYCLE_UNAVAILABLE: "NOT_ACTIVATED",
  // A tampered, unknown-key or wrong-tuple context is indistinguishable from none.
  SCOPE_MISSING: "SCOPE_MISSING",
  SCOPE_INVALID: "SCOPE_MISSING",
  SCOPE_EXPIRED: "SCOPE_EXPIRED",
  SCOPE_REVOKED: "SCOPE_REVOKED",
  SCOPE_SESSION_MISMATCH: "SESSION_MISMATCH",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  SESSION_UNAVAILABLE: "AUTH_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  WORKFLOW_INELIGIBLE: "INELIGIBLE",
};

export function lineWorkflowScopedFailureState(error: unknown): LineWorkflowScopedFailureState {
  if (error instanceof LineWorkflowFailure) return failureStates[error.code] ?? "TEMPORARILY_UNAVAILABLE";
  if (error instanceof NotFoundError) return "RESOURCE_INVALID";
  if (error instanceof ForbiddenError) return "INELIGIBLE";
  return "TEMPORARILY_UNAVAILABLE";
}

/**
 * The only way scoped pages read Patient data: the context cookie is always
 * read here and handed to the mandatory guard; a denial is a finite state,
 * never a redirect into ordinary /app or an empty result.
 */
async function loadScoped<T>(read: (snapshot: LineWorkflowScopedSnapshot) => Promise<T>): Promise<LineWorkflowScopedResult<T>> {
  const credential = (await cookies()).get(LINE_WORKFLOW_CONTEXT_COOKIE_NAME)?.value;
  try {
    return { status: "AUTHORIZED", data: await runLineWorkflowScopedRead(credential, read) };
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { status: "DENIED", state: lineWorkflowScopedFailureState(error) };
  }
}

export function loadLineWorkflowAppointmentRelationships(): Promise<LineWorkflowScopedResult<PatientSelfRelationshipNavigation[]>> {
  return loadScoped(({ actor, database }) => listOwnPatientRelationshipNavigation(actor, { database }));
}

export function loadLineWorkflowAppointmentHistory(
  relationshipId: string,
  requestedPage: unknown,
): Promise<LineWorkflowScopedResult<PatientSelfAppointmentHistory>> {
  return loadScoped(({ actor, database }) => getOwnPatientAppointmentHistory(actor, relationshipId, { database }, requestedPage));
}

export type LineWorkflowAppointmentDetail = {
  detail: PatientSelfAppointmentDetail;
  /** Read-only history; request/review capability flags are deliberately not exposed. */
  rescheduleRequests: PatientAppointmentRescheduleRequest[];
};

export function loadLineWorkflowAppointmentDetail(
  relationshipId: string,
  appointmentId: string,
): Promise<LineWorkflowScopedResult<LineWorkflowAppointmentDetail>> {
  return loadScoped(async ({ actor, database }) => ({
    detail: await getOwnPatientAppointmentDetail(actor, relationshipId, appointmentId, { database }),
    rescheduleRequests: (await getAppointmentRescheduleHistory(actor, relationshipId, appointmentId, { database })).requests,
  }));
}
