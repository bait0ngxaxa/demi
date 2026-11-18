import { describe, expect, it } from "vitest";

import { classifyLineConversationText, normalizeLineConversationText } from "./line-conversation-keywords";

describe("LINE next-appointment keywords", () => {
  it("preserves the message action text during normalization", () => {
    expect(normalizeLineConversationText("ตรวจสอบนัดหมาย")).toBe("ตรวจสอบนัดหมาย");
  });

  it.each(["ตรวจสอบนัดหมาย", " ตรวจสอบนัดหมาย ", "นัด"])("matches %j", (text) => {
    expect(classifyLineConversationText(text)).toBe("NEXT_APPOINTMENT");
  });

  it.each(["ตรวจสอบ นัดหมาย", "ตรวจสอบนัดหมายครับ"])("leaves %j unmatched", (text) => {
    expect(classifyLineConversationText(text)).toBe("UNMATCHED");
  });
});
