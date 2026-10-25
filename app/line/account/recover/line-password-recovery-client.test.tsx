import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookState = vi.hoisted(() => ({ status: null as string | null }));

vi.mock("@line/liff", () => ({ default: {} }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: () => undefined,
    useRef: <T,>(current: T) => ({ current }),
    useState: <T,>(initial: T): [T, (value: T | ((current: T) => T)) => void] => [
      initial === "LOADING" && hookState.status ? hookState.status as T : initial,
      vi.fn(),
    ],
  };
});

import { LinePasswordRecoveryClient } from "./line-password-recovery-client";

describe("LINE recovery link states", () => {
  beforeEach(() => { hookState.status = null; });

  it("renders the new-password form for a verified link", () => {
    hookState.status = "READY";
    const markup = renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-AbCdEf" />);

    expect(markup).toContain("ตั้งรหัสผ่านใหม่");
    expect(markup).toContain('name="newPassword"');
    expect(markup).toContain('name="passwordConfirmation"');
  });

  it.each([
    ["EXPIRED", "ลิงก์นี้ใช้ไม่ได้แล้ว"],
    ["OTHER_LINE", "บัญชี LINE นี้ใช้ยืนยันลิงก์ไม่ได้"],
    ["INELIGIBLE", "ใช้การตั้งรหัสผ่านทาง LINE ไม่ได้"],
    ["COMPLETED", "ตั้งรหัสผ่านใหม่แล้ว"],
    ["LINE_UNAVAILABLE", "เปิดลิงก์ใน LINE"],
  ])("renders a safe %s state", (status, copy) => {
    hookState.status = status;
    const markup = renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-AbCdEf" />);
    expect(markup).toContain(copy);
  });
});
