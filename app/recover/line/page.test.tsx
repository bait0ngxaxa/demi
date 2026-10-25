import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  enabled: false,
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: routeMocks.redirect }));
vi.mock("@/lib/env/server", () => ({ isRecoveryLineEnabled: () => routeMocks.enabled }));

import LineRecoveryEntryPage from "./page";

describe("LINE recovery entry route", () => {
  it("redirects to the chooser while the feature flag is off", async () => {
    routeMocks.enabled = false;
    await expect(LineRecoveryEntryPage()).rejects.toThrow("REDIRECT:/recover");
    expect(routeMocks.redirect).toHaveBeenCalledWith("/recover");
  });

  it("renders the national-ID request form while the feature flag is on", async () => {
    routeMocks.enabled = true;
    const markup = renderToStaticMarkup(await LineRecoveryEntryPage());
    expect(markup).toContain("รับลิงก์ทาง LINE");
    expect(markup).toContain('name="nationalId"');
  });
});
