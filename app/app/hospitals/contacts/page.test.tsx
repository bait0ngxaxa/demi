import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ connection: vi.fn(), contacts: vi.fn() }));
vi.mock("next/server", () => ({ connection: mock.connection }));
vi.mock("@/modules/hospital-contact/transport/hospital-contact-work-page-context", () => ({
  getHospitalWorkContactsPageContext: mock.contacts,
}));

import Page from "./page";

describe("read-only Hospital work contacts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.connection.mockResolvedValue(undefined);
  });

  it("lists all related Hospital contacts and provides a tappable phone link without edit controls", async () => {
    mock.contacts.mockResolvedValue([
      {
        hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" },
        availability: "AVAILABLE",
        addressText: "ถนนสุขภาพ",
        phoneNumber: "02-123-4567",
      },
      {
        hospital: { hospitalCode: "H-002", name: "โรงพยาบาล ข" },
        availability: "AVAILABLE",
        addressText: null,
        phoneNumber: "02-777-8888",
      },
    ]);

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("โรงพยาบาล ก");
    expect(html).toContain("H-001");
    expect(html).toContain("ถนนสุขภาพ");
    expect(html).toContain('href="tel:02-123-4567"');
    expect(html).toContain("โรงพยาบาล ข");
    expect(html).toContain('href="tel:02-777-8888"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(mock.connection).toHaveBeenCalledOnce();
  });

  it("shows an explicit message when a Hospital has not provided contact details", async () => {
    mock.contacts.mockResolvedValue([
      {
        hospital: { hospitalCode: "H-003", name: "โรงพยาบาล ค" },
        availability: "UNAVAILABLE",
        addressText: null,
        phoneNumber: null,
      },
    ]);

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("โรงพยาบาล ค");
    expect(html).toContain("ยังไม่ได้ระบุข้อมูลติดต่อ");
  });
});
