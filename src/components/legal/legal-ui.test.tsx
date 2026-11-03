import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/app-shell/app-shell";

import { accountCreationLegalViewFixture, HEALTH_CONSENT_VERSION_ID, PRIVACY_VERSION_ID, TERMS_VERSION_ID } from "../../../tests/support/legal-fixtures";
import { LegalAcceptanceFields, LegalFooterLinks } from "./legal-acceptance-fields";
import { LegalDocumentBody } from "./legal-document-body";
import { LegalDocumentPage } from "./legal-document-page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/app-shell/logout-button", () => ({ LogoutButton: () => <button>ออกจากระบบ</button> }));

function inputNamed(markup: string, name: string): string {
  return (markup.match(/<input[^>]*>/gu) ?? []).find((input) => input.includes(`name="${name}"`)) ?? "";
}

describe("LegalAcceptanceFields (LG-D4)", () => {
  it("renders one required checkbox with the exact versions and links that keep the form", () => {
    const markup = renderToStaticMarkup(<LegalAcceptanceFields idPrefix="t" legal={accountCreationLegalViewFixture()} />);
    const box = inputNamed(markup, "acceptLegal");
    expect(box).toContain(`required=""`);
    expect(box).toContain(`type="checkbox"`);
    expect(markup).not.toContain("checked");
    expect(inputNamed(markup, "legalTermsVersionId")).toContain(`value="${TERMS_VERSION_ID}"`);
    expect(inputNamed(markup, "legalPrivacyVersionId")).toContain(`value="${PRIVACY_VERSION_ID}"`);
    expect(markup).toContain("ข้าพเจ้ายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ และรับทราบนโยบายการคุ้มครองข้อมูลส่วนบุคคล");
    expect(markup).toContain('href="/legal/terms" rel="noopener" target="_blank"');
    expect(markup).toContain('href="/legal/privacy" rel="noopener" target="_blank"');
  });

  it("has no consent toggles on a non-patient screen (LG-D6)", () => {
    const markup = renderToStaticMarkup(<LegalAcceptanceFields idPrefix="t" legal={accountCreationLegalViewFixture()} />);
    expect(markup).not.toContain('name="consent.');
    expect(markup).not.toContain("ไม่บังคับ");
  });

  it("adds two separate optional consents, unchecked by default, with summaries and full-text links", () => {
    const markup = renderToStaticMarkup(<LegalAcceptanceFields idPrefix="t" legal={accountCreationLegalViewFixture({ includeConsents: true })} />);
    const consentInputs = markup.match(/<input[^>]*name="consent\.[A-Z_]+"[^>]*>/gu) ?? [];
    expect(consentInputs).toHaveLength(2);
    expect(consentInputs.every((input) => !input.includes("required") && !input.includes("checked"))).toBe(true);
    expect(inputNamed(markup, "consent.HEALTH_DATA_DISCLOSURE_CONSENT")).toContain(`value="${HEALTH_CONSENT_VERSION_ID}"`);
    expect(markup).toContain('href="/legal/health-data-consent"');
    expect(markup).toContain('href="/legal/marketing-consent"');
    expect(markup.match(/อ่านฉบับเต็ม/gu)).toHaveLength(2);
  });

  it("shows the field error beside the checkbox", () => {
    const markup = renderToStaticMarkup(<LegalAcceptanceFields error="กรุณายอมรับ" idPrefix="t" legal={accountCreationLegalViewFixture()} />);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="t-legal-error"');
  });

  it("keeps a 380 px layout: wrapping links and no fixed widths", () => {
    const markup = renderToStaticMarkup(<><LegalAcceptanceFields idPrefix="t" legal={accountCreationLegalViewFixture({ includeConsents: true })} /><LegalFooterLinks /></>);
    expect(markup).toContain("flex flex-wrap");
    expect(markup).toContain("min-w-0");
    expect(markup).not.toMatch(/\bw-\[(?:[4-9]\d\d|\d{4,})px\]/u);
  });
});

describe("public legal document", () => {
  const document = { ...accountCreationLegalViewFixture().terms, body: "# ข้อ 1\n\n<b>ไม่ใช่ HTML</b>" };

  it("renders the version label, effective date, placeholder notice and text-only body", () => {
    const markup = renderToStaticMarkup(<LegalDocumentPage document={document} history={[document]} isCurrent />);
    expect(markup).toContain("ฉบับ placeholder-1");
    expect(markup).toContain("มีผลตั้งแต่");
    expect(markup).toContain("ข้อความชั่วคราว");
    expect(markup).toContain("ฉบับปัจจุบัน");
    expect(markup).toContain("&lt;b&gt;ไม่ใช่ HTML&lt;/b&gt;");
    expect(markup).not.toContain("<b>");
  });

  it("marks an earlier version and links back to the current one", () => {
    const markup = renderToStaticMarkup(<LegalDocumentPage document={{ ...document, isPlaceholder: false }} history={[document]} isCurrent={false} />);
    expect(markup).toContain("ฉบับก่อนหน้า");
    expect(markup).toContain('href="/legal/terms"');
    expect(markup).not.toContain("ข้อความชั่วคราว");
  });

  it("renders headings and lists from the Markdown subset", () => {
    const markup = renderToStaticMarkup(<LegalDocumentBody body={"## หัวข้อ\n- หนึ่ง\n- **สอง**"} />);
    expect(markup).toContain("<h3");
    expect(markup).toContain("<ul");
    expect(markup).toContain("<strong");
  });
});

describe("app shell legal banner (LG-D7)", () => {
  it("shows a non-blocking banner linking to the settings page only when re-acceptance is needed", () => {
    const withBanner = renderToStaticMarkup(
      <AppShell displayName="ผู้ใช้" legalReacceptanceNeeded navigation={[]} roleLabels={[]}><p>เนื้อหา</p></AppShell>,
    );
    expect(withBanner).toContain("ฉบับใหม่ ใช้งานต่อได้ตามปกติ");
    expect(withBanner).toContain('href="/app/settings/legal"');
    expect(withBanner).toContain("เนื้อหา");

    const withoutBanner = renderToStaticMarkup(<AppShell displayName="ผู้ใช้" navigation={[]} roleLabels={[]}><p>เนื้อหา</p></AppShell>);
    expect(withoutBanner).not.toContain('href="/app/settings/legal"');
  });
});
