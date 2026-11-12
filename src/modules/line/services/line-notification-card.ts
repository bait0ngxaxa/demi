import "server-only";

import type { LineFlexMessage } from "../adapters/line-messaging-client";
import type { LineWebNavigationIntent } from "../domain/line-navigation-intents";
import { notificationCard, type NotificationCardInput } from "../presentation/flex/notification-card";
import { buildNotificationLiffUrl } from "./line-deep-link-builder";

/** Notification copy whose button is a fixed DEMI page rather than a URL (ADR-0033 D2). */
export type LineNotificationCardCopy = Omit<NotificationCardInput, "action"> & {
  readonly destination?: LineWebNavigationIntent;
  readonly actionLabel?: string;
};

/**
 * Resolves the destination to its Workspace LIFF URL and builds the card.
 * Throws LINE_CONFIGURATION_MISSING without a Workspace LIFF and a contract
 * error for invalid copy; a caller must treat either as "do not send".
 */
export function buildLineNotificationCard(copy: LineNotificationCardCopy): LineFlexMessage {
  const { destination, actionLabel, ...card } = copy;
  return notificationCard({
    ...card,
    ...(destination && actionLabel ? { action: { label: actionLabel, uri: buildNotificationLiffUrl(destination) } } : {}),
  });
}
