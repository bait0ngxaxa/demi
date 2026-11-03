import { describe, expect, it } from "vitest";

import { parseLegalMarkdown } from "./legal-markdown";

describe("legal Markdown subset", () => {
  it("parses headings, paragraphs with line breaks, lists and bold", () => {
    expect(parseLegalMarkdown("# ข้อ 1\nย่อหน้าแรก\nบรรทัดสอง\n\n- ข้อ **สำคัญ**\n- ข้อสอง\n\n1. ลำดับหนึ่ง\n2. ลำดับสอง")).toEqual([
      { type: "heading", level: 1, inlines: [{ text: "ข้อ 1", strong: false }] },
      { type: "paragraph", lines: [[{ text: "ย่อหน้าแรก", strong: false }], [{ text: "บรรทัดสอง", strong: false }]] },
      { type: "list", ordered: false, items: [[{ text: "ข้อ ", strong: false }, { text: "สำคัญ", strong: true }], [{ text: "ข้อสอง", strong: false }]] },
      { type: "list", ordered: true, items: [[{ text: "ลำดับหนึ่ง", strong: false }], [{ text: "ลำดับสอง", strong: false }]] },
    ]);
  });

  it("keeps HTML and unsupported syntax as literal text", () => {
    expect(parseLegalMarkdown("<script>alert(1)</script> [ลิงก์](javascript:x)")).toEqual([
      { type: "paragraph", lines: [[{ text: "<script>alert(1)</script> [ลิงก์](javascript:x)", strong: false }]] },
    ]);
  });

  it("returns no blocks for whitespace", () => {
    expect(parseLegalMarkdown(" \n\r\n ")).toEqual([]);
  });
});
