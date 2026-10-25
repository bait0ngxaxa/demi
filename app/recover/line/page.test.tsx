import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

import LineRecoveryEntryPage from "./page";

describe("LINE recovery entry route", () => {
  it("renders the generic national-ID request form", async () => {
    const markup = renderToStaticMarkup(await LineRecoveryEntryPage());
    expect(markup).toContain("รับลิงก์ทาง LINE");
    expect(markup).toContain('name="nationalId"');
  });
});
