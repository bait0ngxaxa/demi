import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeHospitalContact } from "@/components/home/home-hospital-contact";

import { HospitalMapLink } from "./hospital-map-link";

const location = { latitude: 13.756331, longitude: 100.501765 };
const mapsUrl = "https://www.google.com/maps/search/?api=1&amp;query=13.756331%2C100.501765";

/** Every absolute URL in the markup; the map link must be the only one, and only as an anchor href. */
function externalUrls(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="(https?:[^"]*)"/gu)].map((match) => match[0]);
}

describe("HospitalMapLink", () => {
  it("is a plain new-tab link without a referrer to the keyless Google Maps URL", () => {
    const html = renderToStaticMarkup(<HospitalMapLink hospitalName="โรงพยาบาล ก" location={location} />);

    expect(html).toContain(`href="${mapsUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="เปิดแผนที่ โรงพยาบาล ก (เปิดหน้าใหม่)"');
    expect(html).toContain(">เปิดแผนที่</a>");
  });
});

describe("HomeHospitalContact map location", () => {
  const base = { hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" }, addressText: null, phoneNumber: null };

  it("offers the map link with the address and requests nothing from a map host at render", () => {
    const html = renderToStaticMarkup(
      <HomeHospitalContact contact={{ ...base, addressText: "99 ถนนสุขภาพ", location }} hospitalName="โรงพยาบาล ก" />,
    );

    expect(html).toContain("99 ถนนสุขภาพ");
    expect(html).toContain(">เปิดแผนที่</a>");
    expect(html).not.toMatch(/<(?:iframe|img|script|link|object|embed)\b/u);
    expect(externalUrls(html)).toEqual([`href="${mapsUrl}"`]);
  });

  it("shows the map link alone when only a location is set, and nothing map-related without one", () => {
    const onlyLocation = renderToStaticMarkup(
      <HomeHospitalContact contact={{ ...base, location }} hospitalName="โรงพยาบาล ก" />,
    );
    expect(onlyLocation).not.toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(onlyLocation).toContain(">เปิดแผนที่</a>");

    const none = renderToStaticMarkup(<HomeHospitalContact contact={{ ...base, location: null }} hospitalName="โรงพยาบาล ก" />);
    expect(none).toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(none).not.toContain("เปิดแผนที่");
    expect(externalUrls(none)).toEqual([]);
  });
});
