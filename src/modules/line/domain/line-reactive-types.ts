import "server-only";

export { LINE_PATIENT_NEXT_APPOINTMENT_MARKER } from "./line-reactive-marker";

export const LINE_PATIENT_NEXT_APPOINTMENT_INTENT =
  "PATIENT_NEXT_APPOINTMENT" as const;

/** 45 seconds leaves 15 seconds before LINE's normal one-minute limit, including the 12-second Reply timeout. */
export const LINE_REACTIVE_EXECUTION_AGE_LIMIT_MS = 45_000;

export type LineReactiveDurableResult =
  | { status: "ACCEPTED" }
  | { status: "MATCHING_DUPLICATE" }
  | { status: "EVENT_ID_CONFLICT" };

export const LINE_HELP_INTENT = "HELP" as const;

export type LineReactiveIntent =
  | typeof LINE_PATIENT_NEXT_APPOINTMENT_INTENT
  | typeof LINE_HELP_INTENT;

type LineReactiveWorkItemBase = {
  readonly webhookEventId: string;
  readonly eventOccurredAt: Date;
  readonly localExecutionDeadline: number;
  readonly lineUserId: string;
  readonly replyToken: string;
  readonly isRedelivery: boolean;
};

export type LinePatientNextAppointmentWorkItem = LineReactiveWorkItemBase & {
  readonly intent: typeof LINE_PATIENT_NEXT_APPOINTMENT_INTENT;
};

export type LineHelpWorkItem = LineReactiveWorkItemBase & {
  readonly intent: typeof LINE_HELP_INTENT;
  /** True only for unmatched text; explicit HELP keywords are never throttled. */
  readonly throttled: boolean;
};

export type LineReactiveWorkItem = LinePatientNextAppointmentWorkItem | LineHelpWorkItem;

export type LineReactiveOperationalOutcome =
  | "COMPLETED_WITH_APPOINTMENT"
  | "COMPLETED_EMPTY"
  | "COMPLETED_HELP"
  | "THROTTLED"
  | "REFUSED_INELIGIBLE"
  | "INFRASTRUCTURE_FAILURE"
  | "EXPIRED_BEFORE_QUERY"
  | "EXPIRED_BEFORE_REPLY"
  | "LINE_PROVIDER_TRANSIENT"
  | "LINE_PROVIDER_PERMANENT";

export type LineReactiveMonotonicClock = () => number;
