import "server-only";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { LINE_WEB_NAVIGATION_PATHS, type LineWebNavigationIntent } from "../domain/line-navigation-intents";
import { LineFailure } from "../domain/line-errors";

export type LineNavigationIntent = LineWebNavigationIntent
  | "LINK_ACCOUNT"
  | "MANAGE_ACCOUNT"
  | "SWITCH_WORKSPACE";

function isAccountIntent(
  intent: LineNavigationIntent,
): intent is "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | "SWITCH_WORKSPACE" {
  return intent === "LINK_ACCOUNT" || intent === "MANAGE_ACCOUNT" || intent === "SWITCH_WORKSPACE";
}

export function buildLineIntentUrl(intent: LineNavigationIntent): string {
  const { DEMI_LINE_PUBLIC_ORIGIN } = getLineLoginEnv();
  const liffId = getLineLiffId();
  if (isAccountIntent(intent)) {
    if (!liffId) throw new LineFailure("LINE_CONFIGURATION_MISSING");
    // The LIFF Endpoint URL already points to /line/account. Do not append that path again.
    return `https://liff.line.me/${liffId}`;
  }
  return new URL(LINE_WEB_NAVIGATION_PATHS[intent], DEMI_LINE_PUBLIC_ORIGIN).toString();
}
