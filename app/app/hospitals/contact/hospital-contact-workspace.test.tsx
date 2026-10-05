import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  readHospitalContactForOwnerAction: vi.fn(),
  updateHospitalContactAction: vi.fn(),
}));

import type {
  HospitalContactEditorProjection,
  HospitalContactOwnerHospital,
} from "@/modules/hospital-contact/types/hospital-contact-projections";
import { HospitalContactWorkspace } from "./hospital-contact-workspace";

const hospitalA: HospitalContactOwnerHospital = {
  id: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  name: "โรงพยาบาล ก",
};
const hospitalB: HospitalContactOwnerHospital = {
  id: "22222222-2222-4222-8222-222222222222",
  hospitalCode: "H-002",
  name: "โรงพยาบาล ข",
};
const hospitals: HospitalContactOwnerHospital[] = [hospitalA, hospitalB];

function contact(overrides: Partial<HospitalContactEditorProjection> = {}): HospitalContactEditorProjection {
  return {
    hospital: hospitalA,
    addressText: null,
    phoneNumber: null,
    expectedUpdatedAt: null,
    ...overrides,
  };
}

describe("Hospital Contact Owner interface", () => {
  it("renders read-only Hospital identity, trust copy, labels and an optional empty form", () => {
    const html = renderToStaticMarkup(
      <HospitalContactWorkspace hospitals={[hospitalA]} selectedHospitalId={hospitalA.id} contact={contact()} />,
    );

    expect(html).toContain("โรงพยาบาล ก");
    expect(html).toContain("H-001");
    expect(html).toContain("ข้อมูลติดต่อที่โรงพยาบาลให้ไว้");
    expect(html).toContain('for="hospital-contact-address"');
    expect(html).toContain('for="hospital-contact-phone"');
    expect(html).toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(html).not.toContain("hospitalId=");
    expect(html).not.toContain("ตรวจสอบแล้ว");
  });

  it("renders multi-Hospital selection and wraps long Thai addresses on narrow layouts", () => {
    const longAddress = `ถนนสุขภาพ${" บ้านเลขที่ ๑๒๓".repeat(32)}`;
    const html = renderToStaticMarkup(
      <HospitalContactWorkspace
        hospitals={hospitals}
        selectedHospitalId={hospitalA.id}
        contact={contact({ addressText: longAddress, phoneNumber: "02-123-4567" })}
      />,
    );

    expect(html).toContain('id="hospital-contact-hospital"');
    expect(html).toContain("เลือกโรงพยาบาล");
    expect(html).toContain("มีที่อยู่และหมายเลขโทรศัพท์");
    expect(html).toContain("break-words");
    expect(html).toContain("max-w-full");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("focus-visible:ring-focus-ring");
  });

  it("shows a partial state when only one contact value is available", () => {
    const html = renderToStaticMarkup(
      <HospitalContactWorkspace
        hospitals={[hospitalA]}
        selectedHospitalId={hospitalA.id}
        contact={contact({ phoneNumber: "02-123-4567 ต่อ 123" })}
      />,
    );

    expect(html).toContain("มีข้อมูลติดต่อบางส่วน");
    expect(html).toContain("02-123-4567 ต่อ 123");
    expect(html).toContain("เว้นช่องว่างเพื่อล้างข้อมูลได้");
  });
});
