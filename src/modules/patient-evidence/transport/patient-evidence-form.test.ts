import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { PatientEvidenceForm } from "../../../../app/app/patients/[relationshipId]/evidence/evidence-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";

describe("Patient Evidence form constraints", () => {
  it("keeps the mobile upload workflow narrow and bounded", () => {
    const markup = renderToStaticMarkup(createElement(PatientEvidenceForm, { relationshipId }));

    expect(markup).toContain('accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"');
    expect(markup).toContain('capture="environment"');
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain("JPEG, PNG หรือ WEBP");
    expect(markup).toContain("ไม่เกิน 5 MB");
    expect(markup).toContain("บันทึกหลักฐาน");
    expect(markup).not.toContain("ลบ");
  });
});
