import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: null as unknown }));

vi.mock("@/components/ui/mutation-action-state", () => ({
  submitPreservingInput: () => () => undefined,
  useMutationActionState: (_action: unknown, initialState: unknown) => [
    mocks.state ?? initialState,
    () => undefined,
    false,
    false,
    () => undefined,
  ],
}));

vi.mock("@/modules/patient-access-requests/transport/server-actions", () => ({
  submitPublicPatientAccessRequestAction: vi.fn(),
}));

import { PatientAccessRequestForm } from "./patient-access-request-form";

describe("Patient access request language", () => {
  beforeEach(() => {
    mocks.state = { status: "SUCCESS" };
  });

  it("confirms receipt without implying approval or account activation", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientAccessRequestForm, { hospitals: [] }),
    );

    expect(markup).toContain("ระบบได้รับคำขอแล้ว");
    expect(markup).toContain("โรงพยาบาลจะตรวจสอบข้อมูลก่อนดำเนินการต่อ");
    expect(markup).not.toContain("อนุมัติแล้ว");
    expect(markup).not.toContain("เปิดใช้งานบัญชีสำเร็จ");
  });
});
