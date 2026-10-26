import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ entry: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/modules/line/services/line-deep-link-builder", () => ({ getPublicLineAccountEntryUrl: mocks.entry }));
vi.mock("./patient/patient-activation-form", () => ({ PatientActivationForm: ({ lineAccountUrl }: { lineAccountUrl: string | null }) => <div data-entry={lineAccountUrl} /> }));
vi.mock("./workforce/workforce-activation-form", () => ({ WorkforceActivationForm: ({ lineAccountUrl }: { lineAccountUrl: string | null }) => <div data-entry={lineAccountUrl} /> }));

import PatientPage from "./patient/page";
import WorkforcePage from "./workforce/page";
import { ActivationSuccess } from "@/components/activation/activation-onboarding";

describe("server-configured activation entry", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([PatientPage, WorkforcePage])("passes only the configured public destination to the activation form", async (page) => {
    mocks.entry.mockReturnValue("https://liff.line.me/1234567890-Test");
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain('data-entry="https://liff.line.me/1234567890-Test"');
    expect(mocks.entry).toHaveBeenCalledOnce();
    expect(markup).not.toContain('href="https://liff.line.me/');
  });

  it.each([PatientPage, WorkforcePage])("still renders the form when LINE is not configured", async (page) => {
    mocks.entry.mockReturnValue(null);
    expect(renderToStaticMarkup(await page())).not.toContain("data-entry");
  });

  it("offers actionable web access instead of an empty LINE button when configuration is missing", () => {
    const markup = renderToStaticMarkup(<ActivationSuccess statusRef={null} lineAccountUrl={null} />);
    expect(markup).toContain("ขณะนี้ยังเปิดหน้าเชื่อม LINE ไม่ได้");
    expect(markup).toContain('href="/login"');
    expect(markup).toContain("เข้าสู่ระบบผ่านเว็บก่อน");
    expect(markup).not.toContain("เชื่อม LINE เพื่อเริ่มใช้งาน</a>");
  });
});
