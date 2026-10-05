import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HospitalContentDetailProjection, HospitalContentListProjection } from "@/modules/hospital-content/types/hospital-content-projections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import { HospitalContentCreateForm } from "./new/hospital-content-create-form";
import { HospitalContentListWorkspace } from "./hospital-content-list-workspace";
import { HospitalContentDetailWorkspace } from "./[contentId]/hospital-content-detail-workspace";

const hospital = { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "H001", name: "โรงพยาบาลตัวอย่าง" };
const secondHospital = { id: "44444444-4444-4444-8444-444444444444", hospitalCode: "H002", name: "โรงพยาบาลอีกแห่ง" };

function content(status: HospitalContentStatus): HospitalContentDetailProjection {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    hospital,
    title: "หัวข้อภาษาไทยยาว ๆ",
    body: "<script>alert(1)</script>\n**ไม่แปล Markdown**\n    รักษาบรรทัด",
    category: HospitalContentCategory.FOOD,
    sourceText: "https://example.test/รายการยาว?query=ก",
    status,
    firstPublishedAt: status === HospitalContentStatus.DRAFT ? null : "2026-10-01T10:00:00.000Z",
    latestPublishedAt: status === HospitalContentStatus.DRAFT ? null : "2026-10-02T10:00:00.000Z",
    expectedUpdatedAt: "2026-10-05T12:34:56.789Z",
  };
}

describe("Hospital Content publisher UI output", () => {
  it("keeps list projections free of body and source and shows lifecycle badges", () => {
    const page: HospitalContentListProjection = {
      hospital,
      items: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "เผยแพร่แล้ว",
          category: HospitalContentCategory.EXERCISE,
          status: HospitalContentStatus.PUBLISHED,
          firstPublishedAt: "2026-10-01T10:00:00.000Z",
          latestPublishedAt: "2026-10-02T10:00:00.000Z",
          expectedUpdatedAt: "2026-10-05T12:34:56.789Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "ฉบับร่าง",
          category: HospitalContentCategory.NCD,
          status: HospitalContentStatus.DRAFT,
          firstPublishedAt: null,
          latestPublishedAt: null,
          expectedUpdatedAt: "2026-10-05T12:34:56.789Z",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "เก็บถาวร",
          category: HospitalContentCategory.OTHER,
          status: HospitalContentStatus.ARCHIVED,
          firstPublishedAt: null,
          latestPublishedAt: null,
          expectedUpdatedAt: "2026-10-05T12:34:56.789Z",
        },
      ],
      nextCursor: "hcontentcur_v1_cursor",
    };
    const markup = renderToStaticMarkup(<HospitalContentListWorkspace hospitals={[hospital]} page={page} selectedHospitalId={hospital.id} />);
    expect(markup).toContain("ฉบับร่าง");
    expect(markup).toContain("เก็บถาวร");
    expect(markup).toContain("ดูรายการถัดไป");
    expect(markup).not.toContain("**ไม่แปล Markdown**");
    expect(markup).not.toContain("https://example.test");

    const multiHospitalMarkup = renderToStaticMarkup(
      <HospitalContentListWorkspace hospitals={[hospital, secondHospital]} page={page} selectedHospitalId={hospital.id} />,
    );
    const selectorForm = multiHospitalMarkup.match(/<form\b[^>]*>[\s\S]*?<\/form>/u)?.[0] ?? "";
    expect(selectorForm).toContain('action="/app/hospitals/knowledge"');
    expect(selectorForm).toContain('method="get"');
    expect(selectorForm).toContain('name="hospitalId"');
    expect(selectorForm).toContain('type="submit"');
    expect(selectorForm).toContain("เปลี่ยนโรงพยาบาล");
    expect(selectorForm).toContain(`value="${hospital.id}" selected=""`);
    expect(selectorForm).not.toContain('?cursor=');
    expect(selectorForm).not.toMatch(/name="cursor"/u);
    expect(selectorForm).not.toContain('type="hidden"');
    expect(multiHospitalMarkup).toContain('id="hospital-content-hospital"');
    expect(multiHospitalMarkup).toContain("โรงพยาบาลตัวอย่าง (H001)");
    expect(multiHospitalMarkup).toContain("โรงพยาบาลอีกแห่ง (H002)");
  });

  it("waits for account-scoped session recovery before rendering create fields", () => {
    const singleHospital = renderToStaticMarkup(
      <HospitalContentCreateForm hospitals={[hospital]} selectedHospitalId={hospital.id} recoveryScope="account-scope" />,
    );
    expect(singleHospital).not.toContain('id="hospital-content-create-hospital"');
    expect(singleHospital).not.toContain('id="hospital-content-title"');
    expect(singleHospital).toContain("กำลังตรวจสอบคำขอที่อาจค้างอยู่...");
  });

  it("renders DRAFT editing and escaped plain-text preview with preserved newlines", () => {
    const markup = renderToStaticMarkup(<HospitalContentDetailWorkspace content={content(HospitalContentStatus.DRAFT)} />);
    expect(markup).toContain('id="hospital-content-title"');
    expect(markup).toContain('id="hospital-content-body"');
    expect(markup).toContain("บันทึกฉบับร่าง");
    expect(markup).toContain("เผยแพร่");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("**ไม่แปล Markdown**");
    expect(markup).toContain('value="https://example.test/รายการยาว?query=ก"');
    expect(markup).not.toContain("<a href=\"https://example.test");
  });

  it("renders PUBLISHED and ARCHIVED read-only with only their allowed lifecycle controls", () => {
    const published = renderToStaticMarkup(<HospitalContentDetailWorkspace content={content(HospitalContentStatus.PUBLISHED)} />);
    expect(published).not.toContain('id="hospital-content-title"');
    expect(published).toContain("ถอนการเผยแพร่เพื่อแก้ไข");
    expect(published).toContain("เก็บถาวร");
    expect(published).toContain("ดูตัวอย่างปัจจุบัน");

    const archived = renderToStaticMarkup(<HospitalContentDetailWorkspace content={content(HospitalContentStatus.ARCHIVED)} />);
    expect(archived).not.toContain('id="hospital-content-title"');
    expect(archived).not.toContain("ถอนการเผยแพร่เพื่อแก้ไข");
    expect(archived).not.toMatch(/>เผยแพร่<\/button>|>ถอนการเผยแพร่เพื่อแก้ไข<\/button>|>เก็บถาวร<\/button>/u);
    expect(archived).toContain("ดูตัวอย่างปัจจุบัน");
  });
});
