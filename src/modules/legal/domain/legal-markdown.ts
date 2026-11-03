/**
 * ADR-0028: the Markdown subset of a legal document body. Parsed into plain data and rendered as React text, so a
 * body never becomes HTML. Supported: `#`/`##`/`###` headings, paragraphs (blank-line separated, single line breaks
 * kept), `-`/`*` bullet lists, `1.` numbered lists and `**bold**` inline. Anything else is literal text.
 */
export type LegalInline = { text: string; strong: boolean };

export type LegalBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: LegalInline[] }
  | { type: "paragraph"; lines: LegalInline[][] }
  | { type: "list"; ordered: boolean; items: LegalInline[][] };

export function parseLegalInline(text: string): LegalInline[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/u).filter((part) => part.length > 0);
  return parts.map((part) =>
    part.length > 4 && part.startsWith("**") && part.endsWith("**")
      ? { text: part.slice(2, -2), strong: true }
      : { text: part, strong: false });
}

const HEADING = /^(#{1,3})\s+(.+)$/u;
const BULLET = /^[-*]\s+(.+)$/u;
const ORDERED = /^\d{1,3}[.)]\s+(.+)$/u;

export function parseLegalMarkdown(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: LegalInline[][] = [];
  let list: { ordered: boolean; items: LegalInline[][] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = (): void => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const rawLine of body.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, inlines: parseLegalInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(parseLegalInline(item[1]));
      continue;
    }

    flushList();
    paragraph.push(parseLegalInline(line));
  }

  flushParagraph();
  flushList();
  return blocks;
}
