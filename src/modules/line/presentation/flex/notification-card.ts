import type {
  LineFlexBox,
  LineFlexComponent,
  LineFlexMessage,
} from "../../adapters/line-messaging-client";

/**
 * ADR-0033: one Flex bubble for a proactive LINE notification.
 *
 * Pure: it reads no clock, environment or database, so the same input always
 * serializes to the same JSON and a retried Push can reuse one
 * X-Line-Retry-Key. Callers compute every value (times, URLs) beforehand.
 */
export type NotificationCardTone = "info" | "warning" | "danger" | "success";

export type NotificationCardField = { readonly label: string; readonly value: string };

export type NotificationCardInput = {
  readonly tone: NotificationCardTone;
  readonly title: string;
  readonly fields: readonly NotificationCardField[];
  readonly note?: string;
  /** Workspace or Account LIFF URL only (ADR-0033 D2); omit for a card without a button. */
  readonly action?: { readonly label: string; readonly uri: string };
  /** Shown on lock screens and the chat list; see the ADR-0033 lock-screen rule. */
  readonly altText: string;
};

/** DESIGN.md colour tokens: `<tone>` for the title, `<tone>-soft` for the header. */
const TONE_COLORS: Readonly<Record<NotificationCardTone, { strong: string; soft: string }>> = {
  info: { strong: "#315f74", soft: "#e5f0f4" },
  warning: { strong: "#805313", soft: "#fff3d6" },
  danger: { strong: "#a23a3a", soft: "#f9e8e8" },
  success: { strong: "#176b50", soft: "#e0f1e9" },
};
const INK = "#102620";
const MUTED = "#536b64";
const LINE_COLOR = "#d5e0dc";
const BRAND = "#126759";

export const NOTIFICATION_CARD_LIMITS = {
  altText: 400,
  title: 40,
  fields: 6,
  fieldLabel: 20,
  fieldValue: 120,
  note: 200,
  actionLabel: 20,
  uri: 1000,
  serializedBytes: 10 * 1024,
} as const;

const LIFF_URL_PREFIX = "https://liff.line.me/";

/** A programming error: copy or a caller produced a card outside the ADR-0033 contract. */
export class NotificationCardContractError extends Error {
  constructor(reason: string) {
    super(`Notification card contract violated: ${reason}`);
    this.name = "NotificationCardContractError";
  }
}

function requireText(value: string, max: number, name: string): void {
  if (value.trim() === "" || value !== value.trim()) throw new NotificationCardContractError(`${name} must be non-empty and trimmed`);
  if ([...value].length > max) throw new NotificationCardContractError(`${name} exceeds ${max} characters`);
}

function fieldRow({ label, value }: NotificationCardField): LineFlexBox {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: MUTED, flex: 2, wrap: true },
      { type: "text", text: value, size: "sm", color: INK, flex: 5, wrap: true },
    ],
  };
}

export function notificationCard(input: NotificationCardInput): LineFlexMessage {
  requireText(input.altText, NOTIFICATION_CARD_LIMITS.altText, "altText");
  if (/:\/\/|www\.|liff\.line\.me/iu.test(input.altText)) throw new NotificationCardContractError("altText must not contain a URL");
  requireText(input.title, NOTIFICATION_CARD_LIMITS.title, "title");
  if (input.fields.length > NOTIFICATION_CARD_LIMITS.fields) throw new NotificationCardContractError("too many fields");
  for (const field of input.fields) {
    requireText(field.label, NOTIFICATION_CARD_LIMITS.fieldLabel, "field label");
    requireText(field.value, NOTIFICATION_CARD_LIMITS.fieldValue, "field value");
  }
  if (input.note !== undefined) requireText(input.note, NOTIFICATION_CARD_LIMITS.note, "note");
  if (input.fields.length === 0 && input.note === undefined) throw new NotificationCardContractError("card body is empty");
  if (input.action) {
    requireText(input.action.label, NOTIFICATION_CARD_LIMITS.actionLabel, "action label");
    if (!input.action.uri.startsWith(LIFF_URL_PREFIX) || input.action.uri.length > NOTIFICATION_CARD_LIMITS.uri || /\s/u.test(input.action.uri)) {
      throw new NotificationCardContractError("action must open a LIFF URL");
    }
  }

  const tone = TONE_COLORS[input.tone];
  const body: LineFlexComponent[] = input.fields.map(fieldRow);
  if (input.note !== undefined) {
    if (body.length > 0) body.push({ type: "separator", margin: "md", color: LINE_COLOR });
    body.push({ type: "text", text: input.note, size: "sm", color: MUTED, wrap: true, margin: body.length > 0 ? "md" : "none" });
  }

  const message: LineFlexMessage = {
    type: "flex",
    altText: input.altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: tone.soft,
        contents: [{ type: "text", text: input.title, size: "lg", weight: "bold", color: tone.strong, wrap: true }],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", contents: body },
      ...(input.action
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              paddingAll: "12px",
              contents: [{
                type: "button",
                style: "primary",
                color: BRAND,
                height: "sm",
                action: { type: "uri", label: input.action.label, uri: input.action.uri },
              }],
            } satisfies LineFlexBox,
          }
        : {}),
    },
  };

  if (new TextEncoder().encode(JSON.stringify(message)).length > NOTIFICATION_CARD_LIMITS.serializedBytes) {
    throw new NotificationCardContractError("serialized card exceeds its size bound");
  }
  return message;
}
