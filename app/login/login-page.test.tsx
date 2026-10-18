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

  it("keeps account recovery unavailable and distinguishes a Patient request from activation", async () => {
    const markup = renderToStaticMarkup(await LoginPage());

    expect(markup).toContain("ลืมรหัสผ่าน?");
    expect(markup).toContain("ขณะนี้ยังไม่มีช่องทางกู้คืนบัญชีที่รองรับ");
    expect(markup).not.toContain("โรงพยาบาลจะตรวจสอบตัวตน");
    expect(markup).not.toContain("ออกลิงก์กู้คืนบัญชี");
    expect(markup).toContain("ส่งคำขอใช้บัญชี DEMI");
    expect(markup).toContain('href="/patient/access-request"');
    expect(markup).toContain("ขอใช้งาน DEMI สำหรับโรงพยาบาล");
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

  it("returns an already-authorized user to the exact quick-action destination", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });

    await expect(LoginPage({
      searchParams: Promise.resolve({ returnTo: "/app/patients/assigned?task=screening" }),
    })).rejects.toThrow("redirect boundary");

    expect(mocks.redirect).toHaveBeenCalledWith("/app/patients/assigned?task=screening");
  });

  it("returns an already-authorized user to the fixed MINI gateway, never a scoped resource", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });

    await expect(LoginPage({
      searchParams: Promise.resolve({ returnTo: "/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS" }),
    })).rejects.toThrow("redirect boundary");

    expect(mocks.redirect).toHaveBeenCalledWith("/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS");
  });

  it.each([
    "/line/workflow/appointments",
    "/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS&appointmentId=1",
    "%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS",
  ])("keeps an already-authorized login on /app for an altered workflow return %s", async (returnTo) => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });
    await expect(LoginPage({ searchParams: Promise.resolve({ returnTo }) })).rejects.toThrow("redirect boundary");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("rejects a duplicated workflow return parameter", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });
    const returnTo = ["/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS", "/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS"];
    await expect(LoginPage({ searchParams: Promise.resolve({ returnTo }) })).rejects.toThrow("redirect boundary");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("preserves the existing already-authorized Family invitation fallback", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });

    await expect(LoginPage({
      searchParams: Promise.resolve({ returnTo: `/app/family/invitations#${"a".repeat(43)}` }),
    })).rejects.toThrow("redirect boundary");

    expect(mocks.redirect).toHaveBeenCalledWith("/app");
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
