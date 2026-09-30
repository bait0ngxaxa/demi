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
    expect(markup).not.toContain('href="/recover"');
    expect(markup).not.toContain("ส่งอีเมลกู้คืน");
    expect(markup).not.toContain("ส่ง SMS");
    expect(markup).not.toContain("ส่ง LINE");
  });
});
