import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { HospitalContentCategory } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import { PatientContentFeed } from "./patient-content-feed";
import { PatientContentDetail } from "./patient-content-detail";
import { PatientContentLink } from "./patient-content-link";
import type { HospitalContentPatientDetail } from "@/modules/hospital-content/types/hospital-content-patient-projections";
import type { HospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
vi.mock("next/link", () => ({ default: ({ prefetch, onNavigate: _onNavigate, ...props }: { prefetch?: boolean; onNavigate?: unknown }) => { void _onNavigate; return <a data-prefetch={String(prefetch)} {...props} />; } }));
const content: HospitalContentPatientDetail = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "ข่าวสารภาษาไทย".repeat(15), category: "FOOD", latestPublishedAt: "2026-10-05T12:00:00.000Z", hospital: { name: "โรงพยาบาล ก", hospitalCode: "A001" }, body: "<script>bad</script>\n**plain Markdown**\nบรรทัดที่สอง", sourceText: "https://example.com/" + "long".repeat(100), imageIds: [] };
function feed(overrides: Partial<Extract<HospitalContentPatientFeedContext, { outcome: "READY" }>["page"]> = {}): string {
  return renderToStaticMarkup(<PatientContentFeed context={{ requestId: "request", hospitalRelationshipId: null, outcome: "READY", page: { category: null, items: [content], nextCursor: null, emptyState: null, ...overrides } }} />);
}
describe("Patient Content read presentation", () => {
  it("renders minimal cards with attribution and Bangkok latest time but no body/source", () => {
    const html = feed();
    expect(html).toContain("<h1"); expect(html).toContain("<h2");
    expect(html).toContain(content.title); expect(html).toContain("โรงพยาบาล ก");
    expect(html).toContain("เผยแพร่ล่าสุด"); expect(html).toContain("19:00");
    expect(html).not.toContain("plain Markdown"); expect(html).not.toContain("https://example.com");
    expect(html).not.toMatch(/firstPublishedAt|updatedAt|author|reviewer/u);
    expect(html).toContain('data-prefetch="false"');
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal")(?=[^>]*data-prefetch="false")[^>]*>/u);
    expect(html).toContain('aria-label="ลำดับหน้า"');
    expect(html).toContain("min-w-0"); expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("โรงพยาบาล"); expect(html).toContain("หมวดหมู่");
    expect(html).toContain('dateTime="2026-10-05T12:00:00.000Z"');
    expect(html).not.toContain("/api/hospital-content/images/");
    expect(html).not.toMatch(/summary|excerpt|readCount|recommendation|approval|medical relevance/iu);
  });
  it.each([
    [HospitalContentCategory.NCD, HOSPITAL_CONTENT_CATEGORY_LABELS[HospitalContentCategory.NCD]],
    [HospitalContentCategory.FOOD, HOSPITAL_CONTENT_CATEGORY_LABELS[HospitalContentCategory.FOOD]],
    [HospitalContentCategory.EXERCISE, HOSPITAL_CONTENT_CATEGORY_LABELS[HospitalContentCategory.EXERCISE]],
    [HospitalContentCategory.OTHER, HOSPITAL_CONTENT_CATEGORY_LABELS[HospitalContentCategory.OTHER]],
  ] as const)("keeps the %s Knowledge filter and its category-scoped cursor", (category, label) => {
    const html = feed({
      category,
      items: [{ ...content, category }],
      nextCursor: "opaque-position",
    });

    expect(html).toContain(`${label} (เลือกอยู่)`);
    expect(html).toContain(`value="${category}"`);
    expect(html).toContain(`category=${category}&amp;cursor=opaque-position`);
    expect(html).not.toContain('value="NEWS"');
  });
  it("uses GET category buttons, all via base URL, and never carries an old cursor on filter change", () => {
    const html = feed({ category: "FOOD", nextCursor: "opaque-position" });
    expect(html).toContain('method="get"'); expect(html).toMatch(/<button(?=[^>]*name="category")(?=[^>]*value="FOOD")[^>]*>/u);
    expect(html).toContain('aria-pressed="true"'); expect(html).toContain("อาหาร (เลือกอยู่)");
    expect(html).not.toContain('value=""'); expect(html).not.toContain('value="ALL"');
    expect(html).not.toContain('name="cursor"'); expect(html).toContain("category=FOOD&amp;cursor=opaque-position");
    expect(html).toContain('href="/app/personal/knowledge"'); expect(html).toContain("โหลดรายการล่าสุด");
    expect(html).toContain("min-h-11"); expect(html).toContain("focus-visible:ring");
    expect(html).not.toMatch(/name="(?:hospital|search|sort)"/u);
  });
  it("keeps the selected Hospital on feed links, category forms and cursor pagination", () => {
    const html = renderToStaticMarkup(<PatientContentFeed context={{
      requestId: "request",
      hospitalRelationshipId: "44444444-4444-4444-8444-444444444444",
      outcome: "READY",
      page: { category: "FOOD", items: [content], nextCursor: "opaque-position", emptyState: null },
    }} />);

    expect(html).toContain('name="hospital"');
    expect(html).toContain('value="44444444-4444-4444-8444-444444444444"');
    expect(html).toContain("category=FOOD&amp;cursor=opaque-position&amp;hospital=44444444-4444-4444-8444-444444444444");
    expect(html).toContain('href="/app/personal?hospital=44444444-4444-4444-8444-444444444444"');
  });
  it.each([
    ["EMPTY_A", "ยังไม่มีโรงพยาบาลที่พร้อมแสดงสื่อความรู้"],
    ["EMPTY_B", "ยังไม่มีสื่อความรู้จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ"],
    ["EMPTY_C", "ยังไม่มีสื่อความรู้ในหมวดหมู่นี้"],
  ] as const)("renders exact %s and no detail link", (emptyState, copy) => {
    const html = feed({ emptyState, items: [] }); expect(html).toContain(copy); expect(html).not.toContain(content.id);
    if (emptyState === "EMPTY_C") expect(html).toContain("ดูรายการทั้งหมด");
  });
  it("uses News copy separately from the knowledge feed", () => {
    const html = renderToStaticMarkup(<PatientContentFeed context={{ requestId: "request", hospitalRelationshipId: null, outcome: "READY", page: { category: "NEWS", items: [], nextCursor: null, emptyState: "EMPTY_B" } }} kind="NEWS" />);
    expect(html).toContain("ประกาศจากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ");
    expect(html).not.toContain("สื่อความรู้จากโรงพยาบาล");
  });
  it("keeps a visible NEWS item in the News feed with its existing detail destination", () => {
    const html = renderToStaticMarkup(<PatientContentFeed context={{
      requestId: "request",
      hospitalRelationshipId: null,
      outcome: "READY",
      page: {
        category: HospitalContentCategory.NEWS,
        items: [{ ...content, category: HospitalContentCategory.NEWS }],
        nextCursor: "news-cursor",
        emptyState: null,
      },
    }} kind="NEWS" />);

    expect(html).toContain("ข่าวสาร");
    expect(html).toContain("ประกาศจากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ");
    expect(html).toContain(`href="/app/personal/knowledge/${content.id}"`);
    expect(html).toContain("category=NEWS&amp;cursor=news-cursor");
    expect(html).not.toContain("เลือกหมวดหมู่สื่อความรู้");
    expect(html).not.toContain('name="category"');
  });
  it("renders validation separately with a bounded restart", () => {
    const html = renderToStaticMarkup(<PatientContentFeed context={{ requestId: "request", hospitalRelationshipId: null, outcome: "VALIDATION" }} />);
    expect(html).toContain("ไม่สามารถเปิดหน้ารายการที่ขอได้"); expect(html).not.toContain("ยังไม่มีข่าวสาร");
    expect(html).toContain('href="/app/personal"');

    const newsHtml = renderToStaticMarkup(<PatientContentFeed context={{ requestId: "request", hospitalRelationshipId: null, outcome: "VALIDATION" }} kind="NEWS" />);
    expect(newsHtml).toContain('href="/app/personal/news"');
    expect(newsHtml).not.toContain('name="category"');
  });
  it("handles long Hospital names and multiple images without wrapping image interactions in the content link", () => {
    const longHospitalName = "โรงพยาบาลชุมชนที่มีชื่อยาวสำหรับการทดสอบ".repeat(5);
    const html = feed({
      items: [{ ...content, hospital: { ...content.hospital, name: longHospitalName }, imageIds: ["image-1", "image-2", "image-3"] }],
    });

    expect(html).toContain(longHospitalName);
    expect(html).toContain('src="/api/hospital-content/images/image-1"');
    expect(html).toContain("3 รูป");
    expect(html).not.toContain('src="/api/hospital-content/images/image-2"');
    const titleLinkStart = html.indexOf(`href="/app/personal/knowledge/${content.id}"`);
    const titleLinkEnd = html.indexOf("</a>", titleLinkStart);
    const imagePosition = html.indexOf("/api/hospital-content/images/image-1");
    expect(titleLinkStart).toBeGreaterThanOrEqual(0);
    expect(titleLinkEnd).toBeGreaterThan(titleLinkStart);
    expect(imagePosition).toBeGreaterThan(titleLinkEnd);
  });
  it("renders escaped plain LF/Markdown text and unlinked source with informational trust copy", () => {
    const html = renderToStaticMarkup(<PatientContentDetail content={content} />);
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;\n**plain Markdown**"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<strong>plain");
    expect(html).toContain(content.sourceText); expect(html).not.toContain('href="https://');
    expect(html).toContain("whitespace-pre-wrap"); expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("สื่อความรู้จากโรงพยาบาล"); expect(html).toContain("โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา");
    expect(html).toContain('data-prefetch="false"');
    expect(html).toContain('href="/app/personal/knowledge"');
    expect(html).not.toMatch(/<form\b|<button\b/u);
    const newsHtml = renderToStaticMarkup(<PatientContentDetail content={{ ...content, category: "NEWS" }} />);
    expect(newsHtml).toContain("ข่าวสารจากโรงพยาบาล"); expect(newsHtml).toContain('href="/app/personal/news"');
    expect(renderToStaticMarkup(<PatientContentDetail content={{ ...content, sourceText: null }} />)).not.toContain("แหล่งที่มา / เอกสารอ้างอิง");
  });
  it("protected Link disables prefetch and forces an authoritative document GET", () => {
    const element = PatientContentLink({ href: "/app/personal/knowledge", className: "control", children: "latest" }) as ReactElement<{ prefetch: boolean; onNavigate: (event: { preventDefault: () => void }) => void }>;
    expect(element.props.prefetch).toBe(false);
    const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
    const preventDefault = vi.fn(); element.props.onNavigate({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(assign).toHaveBeenCalledWith("/app/personal/knowledge"); vi.unstubAllGlobals();
  });
});
