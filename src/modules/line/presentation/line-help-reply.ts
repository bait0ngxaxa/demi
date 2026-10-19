import "server-only";

import type { LineQuickReplyAction, LineReplyMessage } from "../adapters/line-messaging-client";
import { LINE_PATIENT_NEXT_APPOINTMENT_MARKER } from "../domain/line-reactive-marker";
import type { OperationalLineRole } from "../domain/line-types";
import { buildLineIntentUrl, type LineNavigationIntent } from "../services/line-deep-link-builder";
import { LINE_APPOINTMENT_REPLY_COPY } from "./line-appointment-reply";

/** WB-DF-18 draft copy; awaiting customer confirmation. */
export const LINE_HELP_REPLY_COPY = {
  PATIENT: "เลือกเมนูที่ต้องการด้านล่าง หรือพิมพ์ “นัด” เพื่อดูนัดหมายถัดไป",
  WORKFORCE: "เลือกเมนูที่ต้องการด้านล่าง",
  INELIGIBLE: LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE,
  INFRASTRUCTURE_FAILURE: "ขณะนี้ยังแสดงเมนูไม่ได้ กรุณาลองใหม่ภายหลัง",
} as const;

export type LineHelpReplyInput = readonly OperationalLineRole[] | "INFRASTRUCTURE_FAILURE";

type QuickReplyDefinition =
  | { type: "uri"; label: string; intent: LineNavigationIntent }
  | { type: "postback"; label: string; data: typeof LINE_PATIENT_NEXT_APPOINTMENT_MARKER };

// Labels match the Rich Menu catalog. URIs are fixed intents only: no IDs.
const QUICK_REPLIES_BY_ROLE: Readonly<Record<OperationalLineRole, readonly QuickReplyDefinition[]>> = {
  PATIENT: [
    { type: "postback", label: "ตรวจสอบนัดหมาย", data: LINE_PATIENT_NEXT_APPOINTMENT_MARKER },
    { type: "uri", label: "นัดหมายทั้งหมด", intent: "OPEN_PATIENT_APPOINTMENTS" },
    { type: "uri", label: "บันทึกสุขภาพ", intent: "OPEN_PATIENT_WELLNESS" },
    { type: "uri", label: "ยาของฉัน", intent: "OPEN_PATIENT_MEDICATIONS" },
    { type: "uri", label: "ข้อมูลการดูแล", intent: "OPEN_PATIENT_CARE" },
  ],
  OSM: [
    { type: "uri", label: "ผู้ป่วยที่ดูแล", intent: "OPEN_OSM_ASSIGNED_PATIENTS" },
    { type: "uri", label: "คัดกรองผู้ป่วย", intent: "START_OSM_SCREENING" },
    { type: "uri", label: "บันทึกติดตาม", intent: "START_OSM_FOLLOWUP" },
  ],
  HOSPITAL: [
    { type: "uri", label: "งานโรงพยาบาล", intent: "OPEN_WORK_WORKSPACE" },
  ],
};

const MANAGE_ACCOUNT_QUICK_REPLY: QuickReplyDefinition = {
  type: "uri",
  label: "จัดการบัญชี DEMI",
  intent: "MANAGE_ACCOUNT",
};

function quickReplyAction(definition: QuickReplyDefinition): LineQuickReplyAction {
  return definition.type === "uri"
    ? { type: "uri", label: definition.label, uri: buildLineIntentUrl(definition.intent) }
    : { type: "postback", label: definition.label, data: definition.data };
}

function textWithQuickReplies(
  text: string,
  definitions: readonly QuickReplyDefinition[],
): LineReplyMessage {
  return {
    type: "text",
    text,
    quickReply: {
      items: definitions.map((definition) => ({ type: "action", action: quickReplyAction(definition) })),
    },
  };
}

/**
 * Builds the HELP reply from the binding's currently eligible roles only.
 * An empty role set covers unbound, multiple-binding and inactive accounts
 * alike, so the reply discloses nothing about which case applied.
 * Throws when a quick-reply URL cannot be built from configuration.
 */
export function buildLineHelpReply(input: LineHelpReplyInput): LineReplyMessage {
  if (input === "INFRASTRUCTURE_FAILURE") {
    return { type: "text", text: LINE_HELP_REPLY_COPY.INFRASTRUCTURE_FAILURE };
  }
  if (input.length === 0) {
    return textWithQuickReplies(LINE_HELP_REPLY_COPY.INELIGIBLE, [MANAGE_ACCOUNT_QUICK_REPLY]);
  }
  return textWithQuickReplies(
    input.includes("PATIENT") ? LINE_HELP_REPLY_COPY.PATIENT : LINE_HELP_REPLY_COPY.WORKFORCE,
    input.flatMap((role) => QUICK_REPLIES_BY_ROLE[role]),
  );
}
