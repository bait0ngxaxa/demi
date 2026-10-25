import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("./public-account-recovery-form", () => ({
  PublicAccountRecoveryForm: ({ lineRecoveryAvailable }: { lineRecoveryAvailable: boolean }) => (
    <div data-line-recovery-available={String(lineRecoveryAvailable)}>Public recovery</div>
  ),
}));

import RecoverAccountPage from "./page";

describe("public recovery entry configuration", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-password-recovery-identity-hash-secret");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-Recovery");
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "private-test-access-token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("passes only the availability boolean to the public form and never serializes credentials", async () => {
    const html = renderToStaticMarkup(await RecoverAccountPage());

    expect(html).toContain('data-line-recovery-available="true"');
    expect(html).not.toContain("private-test-access-token");
    expect(html).not.toContain("line-password-recovery-identity-hash-secret");
  });

  it("passes unavailable state when request configuration is incomplete", async () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", undefined);

    const html = renderToStaticMarkup(await RecoverAccountPage());

    expect(html).toContain('data-line-recovery-available="false"');
  });
});
