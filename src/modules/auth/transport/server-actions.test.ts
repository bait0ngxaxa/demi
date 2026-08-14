import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticateWithPassword,
  signOutCurrentSession,
} from "../services/authentication-service";
import { initialLoginActionState, initialLogoutActionState } from "./action-state";
import { loginAction, logoutAction } from "./server-actions";

const mockedRedirect = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../services/authentication-service", () => ({
  authenticateWithPassword: vi.fn(),
  signOutCurrentSession: vi.fn(),
}));

const mockedAuthenticateWithPassword = vi.mocked(authenticateWithPassword);
const mockedSignOutCurrentSession = vi.mocked(signOutCurrentSession);

function createLoginFormData(nationalId: string, password: string): FormData {
  const formData = new FormData();
  formData.set("nationalId", nationalId);
  formData.set("password", password);
  return formData;
}

describe("authentication Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed transport input before authentication", async () => {
    const result = await loginAction(
      initialLoginActionState,
      createLoginFormData("", "password"),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบตัวระบุเข้าสู่ระบบและรหัสผ่านให้ถูกต้อง",
    });
    expect(mockedAuthenticateWithPassword).not.toHaveBeenCalled();
  });

  it("accepts a custom first-admin identifier at the login transport boundary", async () => {
    mockedAuthenticateWithPassword.mockResolvedValue({
      status: "AUTHORIZED",
      actor: {
        userId: "user-1",
        personId: "person-1",
        roles: [],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
    });

    await loginAction(
      initialLoginActionState,
      createLoginFormData("DEMI-ADMIN-ROOT", "valid-password"),
    );

    expect(mockedAuthenticateWithPassword).toHaveBeenCalledWith({
      nationalId: "DEMI-ADMIN-ROOT",
      password: "valid-password",
    });
    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });

  it("maps invalid credentials to a generic Thai response", async () => {
    mockedAuthenticateWithPassword.mockResolvedValue({ status: "INVALID_CREDENTIALS" });

    const result = await loginAction(
      initialLoginActionState,
      createLoginFormData("1000000000009", "wrong-password"),
    );
    const unknownIdentityResult = await loginAction(
      initialLoginActionState,
      createLoginFormData("1234567890121", "wrong-password"),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_CREDENTIALS",
      message: "ตัวระบุเข้าสู่ระบบหรือรหัสผ่านไม่ถูกต้อง",
    });
    expect(unknownIdentityResult).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("1000000000009");
    expect(JSON.stringify(result)).not.toContain("wrong-password");
  });

  it("sanitizes authentication infrastructure failures", async () => {
    mockedAuthenticateWithPassword.mockRejectedValue(
      new Error("raw provider response must not reach the client"),
    );

    const result = await loginAction(
      initialLoginActionState,
      createLoginFormData("1000000000009", "valid-password"),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "AUTH_INFRASTRUCTURE_FAILURE",
      message: "ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
    });
    expect(JSON.stringify(result)).not.toContain("raw provider response");
  });

  it("redirects to login only after sign-out succeeds", async () => {
    mockedSignOutCurrentSession.mockResolvedValue();

    await logoutAction(initialLogoutActionState, new FormData());

    expect(mockedRevalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("keeps the user on the page with a safe error when sign-out fails", async () => {
    mockedSignOutCurrentSession.mockRejectedValue(new Error("raw provider failure"));

    const result = await logoutAction(initialLogoutActionState, new FormData());

    expect(result).toEqual({
      status: "ERROR",
      message: "ไม่สามารถออกจากระบบได้ กรุณาลองใหม่อีกครั้ง",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
