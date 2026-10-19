import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientSelfSessionExpiredAlert } from "./patient-self-session-expired-alert";

describe("Patient self-service session expiry prompt", () => {
  it("explains the expired session and links to the server-built login destination", () => {
    const html = renderToStaticMarkup(
      <PatientSelfSessionExpiredAlert href="/login?returnTo=%2Fapp%2Fpersonal%2Fwellness" message="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" />,
    );

    expect(html).toContain("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(html).toContain('href="/login?returnTo=%2Fapp%2Fpersonal%2Fwellness"');
    expect(html).toContain("เข้าสู่ระบบ DEMI");
    expect(html).toContain('min-h-11');
  });
});
