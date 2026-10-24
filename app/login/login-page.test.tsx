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

describe("Login page entry points and recovery guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentActorAccess.mockResolvedValue({ status: "UNAUTHENTICATED" });
  });

  it("shows registration and hospital onboarding as secondary action cards", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("ลืมรหัสผ่าน?");
    expect(markup.indexOf("ลืมรหัสผ่าน?")).toBeLessThan(markup.indexOf("ยังไม่มีบัญชีหรือเริ่มใช้งานครั้งแรก?"));
    expect(markup).toContain("ติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน");
    expect(markup).toContain("ยังไม่มีบัญชีหรือเริ่มใช้งานครั้งแรก?");
    expect(markup).toContain("ลงทะเบียนครั้งแรก");
    expect(markup).toContain("สำหรับบุคลากร อสม. และผู้ป่วยที่โรงพยาบาลเพิ่มข้อมูลไว้แล้ว");
    expect(markup).toContain("เริ่มลงทะเบียน");
    expect(markup).toContain("สำหรับผู้แทนโรงพยาบาลแม่ข่ายที่ต้องการส่งคำขอใช้งานระบบ");
    expect(markup).toContain("ส่งคำขอโรงพยาบาล");
    expect(markup).toContain('href="/register"');
    expect(markup).toContain('href="/hospital/onboarding"');
    expect(markup).not.toContain('href="/patient/access-request"');
    expect(markup).not.toContain("มั่นใจ");
    expect(markup).toContain('href="/recover"');
    expect(markup).not.toContain("ส่งอีเมลกู้คืน");
    expect(markup).not.toContain("ส่ง SMS");
    expect(markup).not.toContain("ส่ง LINE");
  });

  it("keeps legacy query hints as neutral login guidance, not proof of completion", async () => {
    const activation = renderToStaticMarkup(await LoginPage({
      searchParams: Promise.resolve({ activated: "1" }),
    }));
    expect(activation).toContain("คำแนะนำสำหรับเข้าสู่ระบบ");
    expect(activation).toContain("หากเพิ่งตั้งรหัสผ่าน");
    expect(activation).not.toContain("เปิดใช้งานบัญชีแล้ว");
    expect(activation).not.toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
    expect(mocks.redirect).not.toHaveBeenCalled();

    const reset = renderToStaticMarkup(await LoginPage({
      searchParams: Promise.resolve({ reset: "1" }),
    }));
    expect(reset).toContain("คำแนะนำสำหรับเข้าสู่ระบบ");
    expect(reset).toContain("หากเพิ่งตั้งรหัสผ่าน");
    expect(reset).not.toContain("ตั้งรหัสผ่านใหม่สำเร็จแล้ว");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("ignores duplicated success hints", async () => {
    const markup = renderToStaticMarkup(await LoginPage({
      searchParams: Promise.resolve({ activated: ["1", "1"], reset: ["1", "1"] }),
    }));

    expect(markup).not.toContain("เปิดใช้งานบัญชีแล้ว");
    expect(markup).not.toContain("ตั้งรหัสผ่านใหม่สำเร็จแล้ว");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects an already-authorized request before rendering the login client", async () => {
    mocks.resolveCurrentActorAccess.mockResolvedValueOnce({ status: "AUTHORIZED" });
    mocks.redirect.mockImplementationOnce(() => { throw new Error("redirect boundary"); });
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect boundary");
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
