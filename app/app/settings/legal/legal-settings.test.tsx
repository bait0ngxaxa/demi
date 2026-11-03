// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { LegalSettingsView } from "@/modules/legal/transport/legal-settings-context";

import { accountCreationLegalViewFixture, HEALTH_CONSENT_VERSION_ID } from "../../../../tests/support/legal-fixtures";

const mocks = vi.hoisted(() => ({ accept: vi.fn(), decide: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/modules/legal/transport/server-actions", () => ({
  acceptCurrentLegalTermsAction: mocks.accept,
  recordConsentDecisionAction: mocks.decide,
}));

import { LegalSettings } from "./legal-settings";

const fixture = accountCreationLegalViewFixture({ includeConsents: true });
const [health, marketing] = fixture.consents;

function view(overrides: Partial<LegalSettingsView> = {}): LegalSettingsView {
  return {
    terms: fixture.terms,
    privacy: fixture.privacy,
    acceptance: { termsVersionLabel: "placeholder-1", privacyVersionLabel: "placeholder-1", acceptedAt: "2026-11-03T03:00:00.000Z" },
    needsAcceptance: false,
    consentsOffered: true,
    canManageDocuments: false,
    consents: [
      { kind: "HEALTH_DATA_DISCLOSURE_CONSENT", current: health ?? null, state: "NONE", decidedVersion: null, newVersionAvailable: false, history: [] },
      { kind: "MARKETING_CONSENT", current: marketing ?? null, state: "NONE", decidedVersion: null, newVersionAvailable: false, history: [] },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(legal: LegalSettingsView): void {
  act(() => root.render(createElement(LegalSettings, { legal })));
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe("settings → เงื่อนไขและการใช้งาน", () => {
  it("lists Terms and Privacy with version and effective date and shows the recorded acceptance", () => {
    render(view());
    expect(container.textContent).toContain("ข้อกำหนดและเงื่อนไขการใช้บริการ");
    expect(container.textContent).toContain("นโยบายการคุ้มครองข้อมูลส่วนบุคคล");
    expect(container.textContent).toContain("ฉบับ placeholder-1");
    expect(container.textContent).toContain("คุณยอมรับฉบับ placeholder-1");
    expect(container.textContent).not.toContain("ยอมรับเวอร์ชันใหม่");
    expect(container.querySelector('a[href="/app/admin/legal"]')).toBeNull();
  });

  it("offers ยอมรับเวอร์ชันใหม่ for a newer version and records it for the shown pair (LG-D7)", async () => {
    mocks.accept.mockResolvedValue({ status: "SUCCESS" });
    render(view({ needsAcceptance: true }));
    expect(container.textContent).toContain("มีข้อกำหนดหรือนโยบายฉบับใหม่");
    expect(container.textContent).toContain("การใช้งานไม่ถูกจำกัด");
    await act(async () => button("ยอมรับเวอร์ชันใหม่").click());
    expect(mocks.accept).toHaveBeenCalledWith({ termsVersionId: fixture.terms.id, privacyVersionId: fixture.privacy.id });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("gives a consent with a nonce for the current version and reuses it on retry of the same click", async () => {
    mocks.decide.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }).mockResolvedValueOnce({ status: "SUCCESS" });
    render(view());
    await act(async () => button("ให้ความยินยอมตามฉบับ").click());
    await act(async () => button("ให้ความยินยอมตามฉบับ").click());
    const [first, second] = mocks.decide.mock.calls.map(([input]) => input as { submissionNonce: string; kind: string; decision: string; documentVersionId: string });
    expect(first).toMatchObject({ kind: "HEALTH_DATA_DISCLOSURE_CONSENT", decision: "GIVEN", documentVersionId: HEALTH_CONSENT_VERSION_ID });
    expect(second?.submissionNonce).toBe(first?.submissionNonce);
  });

  it("shows given state, new-version flag, withdraw action and history", () => {
    render(view({
      consents: [
        {
          kind: "HEALTH_DATA_DISCLOSURE_CONSENT",
          current: health ?? null,
          state: "GIVEN",
          decidedVersion: { ...fixture.terms, id: "old", kind: "HEALTH_DATA_DISCLOSURE_CONSENT", versionLabel: "v0" },
          newVersionAvailable: true,
          history: [{ id: "e1", decision: "GIVEN", decidedAt: "2026-11-01T03:00:00.000Z", versionLabel: "v0", channel: "LIFF" }],
        },
        { kind: "MARKETING_CONSENT", current: marketing ?? null, state: "WITHDRAWN", decidedVersion: null, newVersionAvailable: false, history: [] },
      ],
    }));
    expect(container.textContent).toContain("ให้ความยินยอมแล้ว");
    expect(container.textContent).toContain("มีเวอร์ชันใหม่");
    expect(container.textContent).toContain("ให้ไว้ตามฉบับ v0");
    expect(container.textContent).toContain("ถอนความยินยอมแล้ว");
    expect(container.textContent).toContain("ประวัติ (1)");
    expect(container.textContent).toContain("LINE");
    expect(button("ถอนความยินยอม")).toBeTruthy();
  });

  it("shows Terms/Privacy only to an account without a PATIENT role (LG-D6) and the ADMIN management link", () => {
    render(view({ consentsOffered: false, canManageDocuments: true }));
    expect(container.textContent).not.toContain("ความยินยอมแต่ละรายการ");
    expect(container.textContent).not.toContain("ให้ความยินยอมตามฉบับ");
    expect(container.querySelector('a[href="/app/admin/legal"]')).not.toBeNull();
  });

  it("keeps a 380 px layout: wrapping rows and actions, no fixed widths", () => {
    render(view({ needsAcceptance: true }));
    expect(container.innerHTML).toContain("flex flex-wrap");
    expect(container.innerHTML).toContain("min-w-0");
    expect(container.innerHTML).not.toMatch(/\bw-\[(?:[4-9]\d\d|\d{4,})px\]/u);
  });
});
