import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { carouselIndexForKey, HospitalContentImageCarousel } from "./hospital-content-image-carousel";
import { HospitalContentImageList } from "./hospital-content-image-list";

const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-000000000001", "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", "aaaaaaaa-aaaa-4aaa-8aaa-000000000003"];

describe("HospitalContentImageCarousel", () => {
  it("renders nothing without images", () => {
    expect(renderToStaticMarkup(<HospitalContentImageCarousel imageIds={[]} title="หัวข้อ" />)).toBe("");
  });

  it("renders a single image without carousel semantics or controls", () => {
    const html = renderToStaticMarkup(<HospitalContentImageCarousel imageIds={[ids[0] as string]} title="หัวข้อ" />);
    expect(html).toContain(`src="/api/hospital-content/images/${ids[0]}"`);
    expect(html).toContain("aspect-[4/3]");
    expect(html).not.toContain("carousel");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("1/1");
  });

  it("renders an accessible, layout-stable carousel for several images", () => {
    const html = renderToStaticMarkup(<HospitalContentImageCarousel imageIds={ids} title="หัวข้อ" />);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.match(/aria-roledescription="slide"/gu)).toHaveLength(3);
    for (const n of [1, 2, 3]) expect(html).toContain(`aria-label="ภาพที่ ${n} จาก 3"`);
    expect(html).toContain("snap-x");
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("motion-safe:scroll-smooth");
    expect(html.match(/aspect-\[4\/3\]/gu)).toHaveLength(3);
    expect(html.match(/object-contain/gu)).toHaveLength(3);
    expect(html.match(/loading="lazy"/gu)).toHaveLength(3);
    expect(html).toContain("1/3");
    const buttons = html.match(/<button[^>]*>/gu) ?? [];
    expect(buttons.find((tag) => tag.includes('aria-label="ภาพก่อนหน้า"'))).toContain('disabled=""');
    expect(buttons.find((tag) => tag.includes('aria-label="ภาพถัดไป"'))).not.toContain('disabled=""');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("min-h-11");
  });

  it("maps arrow, Home and End keys to a clamped slide index and ignores other keys", () => {
    expect(carouselIndexForKey("ArrowRight", 0, 3)).toBe(1);
    expect(carouselIndexForKey("ArrowRight", 2, 3)).toBe(2);
    expect(carouselIndexForKey("ArrowLeft", 1, 3)).toBe(0);
    expect(carouselIndexForKey("ArrowLeft", 0, 3)).toBe(0);
    expect(carouselIndexForKey("Home", 2, 3)).toBe(0);
    expect(carouselIndexForKey("End", 0, 3)).toBe(2);
    expect(carouselIndexForKey("Tab", 1, 3)).toBeNull();
  });
});

describe("HospitalContentImageList cover", () => {
  it("shows only the first image and no badge for one image", () => {
    const html = renderToStaticMarkup(<HospitalContentImageList imageIds={[ids[0] as string]} title="หัวข้อ" />);
    expect(html.match(/<img/gu)).toHaveLength(1);
    expect(html).not.toContain("รูป</figcaption>");
  });

  it("shows one cover image with an image-count badge when there are several", () => {
    for (const layout of ["default", "home"] as const) {
      const html = renderToStaticMarkup(<HospitalContentImageList imageIds={ids} layout={layout} title="หัวข้อ" />);
      expect(html.match(/<img/gu)).toHaveLength(1);
      expect(html).toContain(ids[0]);
      expect(html).not.toContain(ids[1]);
      expect(html).toContain("3 รูป");
    }
  });

  it("renders nothing without images", () => {
    expect(renderToStaticMarkup(<HospitalContentImageList imageIds={[]} title="หัวข้อ" />)).toBe("");
  });
});
