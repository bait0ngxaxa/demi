import "server-only";

import { LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT } from "./line-reactive-marker";

/**
 * Exact keyword table for LINE text messages (WB-DF-18). Matching is exact
 * after normalization only: no substring, fuzzy or NLU interpretation. The
 * text itself is never returned, stored or logged; only the class leaves here.
 */
const NEXT_APPOINTMENT_KEYWORDS: ReadonlySet<string> = new Set([
  LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT,
  "นัดหมาย",
  "นัดถัดไป",
]);
const HELP_KEYWORDS: ReadonlySet<string> = new Set(["เมนู", "ช่วยเหลือ", "help"]);

export type LineConversationTextClass = "NEXT_APPOINTMENT" | "HELP" | "UNMATCHED";

export function normalizeLineConversationText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

export function classifyLineConversationText(text: string): LineConversationTextClass {
  const normalized = normalizeLineConversationText(text);
  if (NEXT_APPOINTMENT_KEYWORDS.has(normalized)) return "NEXT_APPOINTMENT";
  if (HELP_KEYWORDS.has(normalized)) return "HELP";
  return "UNMATCHED";
}
