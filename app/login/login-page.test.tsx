import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  redirect: vi.fn(),
  resolveCurrentActorAccess: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/actor-context-service", () => ({
  resolveCurrentActorAccess: mocks.resolveCurrentActorAccess,
}));
vi.mock("./login-form", () => ({ LoginForm: () => null }));

import LoginPage from "./page";

describe("Login page assisted recovery guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentActorAccess.mockResolvedValue({ status: "UNAUTHENTICATED" });
  });

  it("directs locked-out Patients to their Hospital without offering public recovery", async () => {
    const markup = renderToStaticMarkup(await LoginPage());

    expect(markup).toContain("ลืมรหัสผ่าน?");
    expect(markup).toContain("โรงพยาบาลที่ดูแล");
    expect(markup).toContain("ตรวจสอบตัวตน");
    expect(markup).toContain("ลิงก์กู้คืนบัญชี");
    expect(markup).toContain("ขอเปิดใช้งานสำหรับผู้ป่วย");
    expect(markup).toContain('href="/patient/access-request"');
    expect(markup).toContain("ส่งคำขอลงทะเบียนโรงพยาบาล");
    expect(markup).not.toContain('href="/recover"');
    expect(markup).not.toContain("ส่งอีเมลกู้คืน");
    expect(markup).not.toContain("ส่ง SMS");
    expect(markup).not.toContain("ส่ง LINE");
  });
  it("redirects an already-authorized request before rendering the login client", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });
    await expect(LoginPage()).rejects.toThrow("redirect boundary");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
    // This proves the server destination, not browser fragment inheritance.
  });

  it("returns an already-authorized user to the safe LINE destination", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });

    await expect(LoginPage({ searchParams: Promise.resolve({ returnTo: "/line/account" }) }))
      .rejects.toThrow("redirect boundary");

    expect(mocks.redirect).toHaveBeenCalledWith("/line/account");
  });

  it.each(["/app/settings", "https://attacker.example/"]) (
    "keeps an already-authorized login on /app for an unsafe return path %s",
    async (returnTo) => {
      mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
      mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });

      await expect(LoginPage({ searchParams: Promise.resolve({ returnTo }) })).rejects.toThrow("redirect boundary");

      expect(mocks.redirect).toHaveBeenCalledWith("/app");
    },
  );

});
