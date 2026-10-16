import { afterEach, describe, expect, it, vi } from "vitest";

const toastMethods = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMethods }));

import { notify } from "./notify";

afterEach(() => vi.clearAllMocks());

describe("notify", () => {
  it("maps each semantic operation to Sonner with its bounded duration", () => {
    notify.success("บันทึกแล้ว");
    notify.error("ดำเนินการไม่สำเร็จ");
    notify.warning("โปรดตรวจสอบข้อมูลล่าสุด");
    notify.info("มีข้อมูลเพิ่มเติม");

    expect(toastMethods.success).toHaveBeenCalledWith("บันทึกแล้ว", { duration: 3500 });
    expect(toastMethods.error).toHaveBeenCalledWith("ดำเนินการไม่สำเร็จ", { duration: 5500 });
    expect(toastMethods.warning).toHaveBeenCalledWith("โปรดตรวจสอบข้อมูลล่าสุด", { duration: 5000 });
    expect(toastMethods.info).toHaveBeenCalledWith("มีข้อมูลเพิ่มเติม", { duration: 4000 });
  });
});
