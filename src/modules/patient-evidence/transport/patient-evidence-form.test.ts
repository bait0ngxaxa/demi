import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedUseState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useState: mockedUseState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { PatientEvidenceForm } from "../../../../app/app/patients/[relationshipId]/evidence/evidence-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";

describe("Patient Evidence form constraints", () => {
  beforeEach(() => {
    mockedUseState.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()]);
  });

  it("keeps the mobile upload workflow narrow and bounded", () => {
    const markup = renderToStaticMarkup(createElement(PatientEvidenceForm, { relationshipId }));

    expect(markup).toContain('accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"');
    expect(markup).toContain('capture="environment"');
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain("JPEG, PNG หรือ WEBP");
    expect(markup).toContain("เลือกรูปได้สูงสุด 25 MB");
    expect(markup).toContain("ระบบจะลดขนาดรูปให้อัตโนมัติก่อนอัปโหลด");
    expect(markup).not.toContain("ไม่เกิน 5 MB");
    expect(markup).toContain("บันทึกหลักฐาน");
    expect(markup).not.toContain("ลบ");
  });

  it.each([
    [{ status: "processing" }, "กำลังเตรียมรูป…"],
    [{ status: "uploading" }, "กำลังอัปโหลด…"],
    [{ status: "success", message: "บันทึกหลักฐานเรียบร้อยแล้ว" }, "บันทึกหลักฐานเรียบร้อยแล้ว"],
    [{ status: "error", message: "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้ กรุณาเลือกรูปอื่น" }, "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้ กรุณาเลือกรูปอื่น"],
  ])("renders the %s feedback state", (feedback, expectedMessage) => {
    mockedUseState.mockReturnValue([feedback, vi.fn()]);

    const markup = renderToStaticMarkup(createElement(PatientEvidenceForm, { relationshipId }));

    expect(markup).toContain(expectedMessage);
  });
});
