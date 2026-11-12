import "server-only";

import { getLineLiffId, getLineLoginEnv, getLineWorkspaceLiffId } from "@/lib/env/server";
import { LINE_WEB_NAVIGATION_PATHS, type LineWebNavigationIntent } from "../domain/line-navigation-intents";
import { LineFailure } from "../domain/line-errors";

export type LineAccountNavigationIntent = "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | "SWITCH_WORKSPACE";
export type LineNavigationIntent = LineWebNavigationIntent | LineAccountNavigationIntent;

const LIFF_ORIGIN = "https://liff.line.me";

function isAccountIntent(intent: LineNavigationIntent): intent is LineAccountNavigationIntent {
  return intent === "LINK_ACCOUNT" || intent === "MANAGE_ACCOUNT" || intent === "SWITCH_WORKSPACE";
}

/** Account LIFF. Its Endpoint URL already points to /line/account; never append that path again. */
export function buildAccountLiffUrl(): string {
  const liffId = getLineLiffId();
  if (!liffId) throw new LineFailure("LINE_CONFIGURATION_MISSING");
  return `${LIFF_ORIGIN}/${liffId}`;
}

/** Fixed same-origin web URL; opens in LINE's ordinary in-app browser when tapped in LINE. */
export function buildOrdinaryWebUrl(intent: LineWebNavigationIntent): string {
  const { DEMI_LINE_PUBLIC_ORIGIN } = getLineLoginEnv();
  return new URL(LINE_WEB_NAVIGATION_PATHS[intent], DEMI_LINE_PUBLIC_ORIGIN).toString();
}

/**
 * Workspace LIFF URL (Endpoint URL = public origin root). The fixed path and
 * query become `liff.state` and LIFF's secondary redirect opens exactly that
 * same-origin path in the Full LIFF browser. Returns null when the Workspace
 * LIFF is not configured; it never substitutes the Account or MINI LIFF.
 */
export function buildWorkspaceLiffUrl(intent: LineWebNavigationIntent): string | null {
  const liffId = getLineWorkspaceLiffId();
  if (!liffId) return null;
  // Origin is validated even though it is not embedded: the Endpoint URL must be that origin.
  getLineLoginEnv();
  return `${LIFF_ORIGIN}/${liffId}${LINE_WEB_NAVIGATION_PATHS[intent]}`;
}

/**
 * ADR-0033 D2: the button URL of a proactive Flex notification. Always the
 * Workspace LIFF; without one it throws LINE_CONFIGURATION_MISSING and never
 * substitutes an ordinary web URL or another LIFF.
 */
export function buildNotificationLiffUrl(intent: LineWebNavigationIntent): string {
  const url = buildWorkspaceLiffUrl(intent);
  if (url === null) throw new LineFailure("LINE_CONFIGURATION_MISSING");
  return url;
}

/**
 * The URL a LINE surface (Rich Menu, Quick Reply) opens for an intent:
 * Account intents use the Account LIFF; operational intents use the Workspace
 * LIFF, or the ordinary web URL until a Workspace LIFF is configured.
 */
export function buildLineIntentUrl(intent: LineNavigationIntent): string {
  if (isAccountIntent(intent)) {
    getLineLoginEnv();
    return buildAccountLiffUrl();
  }
  return buildWorkspaceLiffUrl(intent) ?? buildOrdinaryWebUrl(intent);
}

/** Public presentation only; missing integration configuration must leave web access usable. */
export function getPublicLineAccountEntryUrl(): string | null {
  try {
    return buildLineIntentUrl("LINK_ACCOUNT");
  } catch {
    return null;
  }
}

/**
 * Workspace LIFF URL of the work dashboard, for Account LIFF -> Workspace LIFF
 * transitions. Null when the Workspace LIFF or LINE Login configuration is
 * missing or invalid; it never substitutes the Account or MINI LIFF.
 */
export function getPublicLineWorkspaceEntryUrl(): string | null {
  try {
    return buildWorkspaceLiffUrl("OPEN_WORK_WORKSPACE");
  } catch {
    return null;
  }
}
