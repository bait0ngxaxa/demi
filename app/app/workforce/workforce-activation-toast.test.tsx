// @vitest-environment jsdom

import { MembershipStatus, MembershipType, Profession, UserStatus } from "@prisma/client";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remoteAction: vi.fn(),
  assistedAction: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info },
}));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: vi.fn(),
  provisionOsmAction: vi.fn(),
  provisionWorkforceBulkAction: vi.fn(),
  regenerateWorkforceActivationAction: mocks.remoteAction,
  startAssistedWorkforceActivationAction: mocks.assistedAction,
}));

import type { WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import type { WorkforceActivationActionState } from "@/modules/workforce/transport/action-state";
import { WorkforceWorkspace } from "./workforce-workspace";

const hospitalA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "โรงพยาบาล ก",
  hospitalCode: "H-001",
  scope: "OWNER" as const,
};
const hospitalB = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "โรงพยาบาล ข",
  hospitalCode: "H-002",
  scope: "OWNER" as const,
};

const TOKEN = "mock-one-time-activation-token";
const SECOND_TOKEN = "mock-second-activation-token";
const USER_ONE = "33333333-3333-4333-8333-333333333331";
const USER_TWO = "33333333-3333-4333-8333-333333333332";

function pendingRow(userId: string, displayName: string): WorkforceListRow {
  return {
    id: `relationship-${userId}`,
    userId,
    displayName,
    kind: "HOSPITAL_MEMBER",
    membershipType: MembershipType.MEMBER,
    profession: Profession.NURSE,
    relationshipStatus: MembershipStatus.PROVISIONED,
    accountStatus: UserStatus.PROVISIONED,
    activationRequired: true,
    activationStatus: "PENDING",
    activationExpiresAt: new Date("2026-10-20T03:00:00.000Z"),
    activationMode: "REMOTE",
  };
}

const rows = [pendingRow(USER_ONE, "บุคลากรหนึ่ง"), pendingRow(USER_TWO, "บุคลากรสอง")];

function activationResult(
  userId = USER_ONE,
  hospitalId = hospitalA.id,
  activationToken = TOKEN,
): WorkforceActivationActionState {
  return {
    status: "SUCCESS",
    result: {
      userId,
      hospitalId,
      kind: "HOSPITAL_MEMBER",
      activationToken,
      activationExpiresAt: "2026-10-20T03:00:00.000Z",
      activationMode: "REMOTE",
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

let container: HTMLDivElement;
let root: Root;
let replace: ReturnType<typeof vi.fn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.remoteAction.mockReset().mockResolvedValue(activationResult());
  mocks.assistedAction.mockReset().mockResolvedValue(activationResult());
  mocks.success.mockReset();
  mocks.warning.mockReset();
  mocks.error.mockReset();
  mocks.info.mockReset();
  replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function renderWorkspace(selectedHospitalId = hospitalA.id): void {
  const hospital = [hospitalA, hospitalB].find((item) => item.id === selectedHospitalId);
  if (!hospital) throw new Error("Test Hospital is missing");
  act(() => {
    root.render(
      createElement(WorkforceWorkspace, {
        hospitals: [hospitalA, hospitalB],
        selectedHospitalId,
        workforce: {
          hospital,
          viewerScope: "OWNER",
          rows,
          pageInfo: {
            pageSize: 25,
            serverTime: 1791849600000,
            search: "",
            status: null,
            staffCursor: null,
            osmCursor: null,
            staffNextCursor: null,
            osmNextCursor: null,
          },
        },
      }),
    );
  });
}

/** Both the pending section and the roster row offer the same remote action; the last form is the roster row's. */
function activationForm(userId: string, label: "ออกลิงก์ใหม่" | "เริ่มแบบช่วยเหลือ"): HTMLFormElement {
  const forms = Array.from(container.querySelectorAll("form")).filter((form) => {
    const hidden = form.querySelector<HTMLInputElement>('input[name="userId"][type="hidden"]');
    const button = form.querySelector("button");
    return hidden?.value === userId && button?.textContent?.includes(label);
  });
  const form = forms.at(-1);
  if (!form) throw new Error(`Missing ${label} form for ${userId}`);
  return form;
}

function submit(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("Missing submit button");
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
}

function acknowledgeButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("ยืนยันว่าได้คัดลอกหรือส่งมอบลิงก์แล้ว"),
  );
}

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

describe("Workforce remote activation issuance Toasts", () => {
  it("announces a confirmed issuance once, keeps the link in the roster UI, and keeps the credential out of the Toast", async () => {
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ออกลิงก์เปิดใช้งานใหม่แล้ว");
    expect(container.textContent).toContain("ออกลิงก์เปิดใช้งานใหม่แล้ว");
    expect(container.textContent).toContain(TOKEN);
    const serialized = JSON.stringify(toastCalls());
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(USER_ONE);
    expect(serialized).not.toContain("/activate/workforce");
    expect(serialized).not.toContain(hospitalA.id);
  });

  it("emits one Toast and stores one credential under React Strict Mode", async () => {
    act(() => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(WorkforceWorkspace, {
            hospitals: [hospitalA, hospitalB],
            selectedHospitalId: hospitalA.id,
            workforce: {
              hospital: hospitalA,
              viewerScope: "OWNER",
              rows,
              pageInfo: {
                pageSize: 25,
                serverTime: 1791849600000,
                search: "",
                status: null,
                staffCursor: null,
                osmCursor: null,
                staffNextCursor: null,
                osmNextCursor: null,
              },
            },
          }),
        ),
      );
    });

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ออกลิงก์เปิดใช้งานใหม่แล้ว");
    expect(container.textContent).toContain(TOKEN);
  });

  it("does not replay the Toast after a rerender", async () => {
    renderWorkspace();
    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    renderWorkspace();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).toHaveBeenCalledOnce();
  });

  it("blocks another regeneration until the undelivered link is acknowledged, then replaces it", async () => {
    renderWorkspace();
    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    const otherButton = activationForm(USER_TWO, "ออกลิงก์ใหม่").querySelector("button");
    expect(otherButton?.disabled).toBe(true);
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));
    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(TOKEN);

    const acknowledge = acknowledgeButton();
    if (!acknowledge) throw new Error("Missing acknowledgment button");
    await act(async () => acknowledge.click());
    mocks.remoteAction.mockResolvedValueOnce(activationResult(USER_TWO, hospitalA.id, SECOND_TOKEN));
    expect(activationForm(USER_TWO, "ออกลิงก์ใหม่").querySelector("button")?.disabled).toBe(false);
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));

    expect(mocks.remoteAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(SECOND_TOKEN);
    expect(container.textContent).not.toContain(TOKEN);
    expect(mocks.success).toHaveBeenCalledTimes(2);
  });

  it("keeps a delivered link visible when a later request returns UNAVAILABLE", async () => {
    renderWorkspace();
    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));
    const acknowledge = acknowledgeButton();
    if (!acknowledge) throw new Error("Missing acknowledgment button");
    await act(async () => acknowledge.click());

    mocks.remoteAction.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ข้อความโครงสร้างพื้นฐาน" });
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));

    expect(container.textContent).toContain(TOKEN);
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("ข้อความโครงสร้างพื้นฐาน");
    expect(container.textContent).toContain("ระบบอาจออกลิงก์ใหม่แล้ว แต่ลิงก์นั้นแสดงซ้ำไม่ได้");
  });

  it("warns for a confirmed conflict and shows the inline message", async () => {
    mocks.remoteAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFLICT",
      message: "ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้ กรุณาตรวจสอบสถานะแล้วลองใหม่",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("ไม่สามารถออกลิงก์ใหม่ได้ กรุณาตรวจสอบสถานะล่าสุด");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้");
  });

  it("reports a confirmed forbidden response as an error", async () => {
    mocks.remoteAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการบุคลากรของโรงพยาบาลนี้",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานใหม่");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("keeps validation errors inline with no Toast", async () => {
    mocks.remoteAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถออกลิงก์เปิดใช้งานใหม่ได้",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ไม่สามารถออกลิงก์เปิดใช้งานใหม่ได้");
  });

  it("treats a returned UNAVAILABLE as an unknown outcome: no Toast, review guidance, locked roster, no retry", async () => {
    mocks.remoteAction.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ข้อความโครงสร้างพื้นฐาน" });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบอาจออกลิงก์ใหม่แล้ว แต่ลิงก์นั้นแสดงซ้ำไม่ได้");
    expect(container.textContent).toContain("โหลดสถานะบุคลากรล่าสุด");
    expect(container.textContent).not.toContain("ข้อความโครงสร้างพื้นฐาน");
    expect(activationForm(USER_ONE, "ออกลิงก์ใหม่").querySelector("button")?.disabled).toBe(true);
    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));
    expect(mocks.remoteAction).toHaveBeenCalledOnce();
  });

  it("treats a thrown request as an unknown outcome with the same guidance and no retry", async () => {
    mocks.remoteAction.mockRejectedValueOnce(new Error("network lost"));
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบอาจออกลิงก์ใหม่แล้ว แต่ลิงก์นั้นแสดงซ้ำไม่ได้");
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));
    expect(mocks.remoteAction).toHaveBeenCalledOnce();
  });

  it("does not treat a success for a different user as confirmation", async () => {
    mocks.remoteAction.mockResolvedValueOnce(activationResult(USER_TWO));
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).not.toContain(TOKEN);
    expect(container.textContent).toContain("ระบบอาจออกลิงก์ใหม่แล้ว แต่ลิงก์นั้นแสดงซ้ำไม่ได้");
  });

  it("drops a rapid duplicate regeneration before it reaches the Server Action", async () => {
    const action = deferred<WorkforceActivationActionState>();
    mocks.remoteAction.mockReturnValueOnce(action.promise);
    renderWorkspace();

    await act(async () => {
      submit(activationForm(USER_ONE, "ออกลิงก์ใหม่"));
      submit(activationForm(USER_ONE, "ออกลิงก์ใหม่"));
      await Promise.resolve();
    });
    await act(async () => {
      action.resolve(activationResult());
      await action.promise;
    });

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("does not run a concurrent regeneration for a different roster row", async () => {
    const action = deferred<WorkforceActivationActionState>();
    mocks.remoteAction.mockReturnValueOnce(action.promise);
    renderWorkspace();

    await act(async () => {
      submit(activationForm(USER_ONE, "ออกลิงก์ใหม่"));
      await Promise.resolve();
    });
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));
    await act(async () => submit(activationForm(USER_TWO, "เริ่มแบบช่วยเหลือ")));
    await act(async () => {
      action.resolve(activationResult());
      await action.promise;
    });

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(mocks.assistedAction).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("shows no Toast or credential in another Hospital when the context changes while pending, and restores it on return", async () => {
    const action = deferred<WorkforceActivationActionState>();
    mocks.remoteAction.mockReturnValueOnce(action.promise);
    renderWorkspace(hospitalA.id);
    await act(async () => {
      submit(activationForm(USER_ONE, "ออกลิงก์ใหม่"));
      await Promise.resolve();
    });

    renderWorkspace(hospitalB.id);
    await act(async () => {
      action.resolve(activationResult());
      await action.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).not.toContain(TOKEN);

    renderWorkspace(hospitalA.id);
    expect(container.textContent).toContain(TOKEN);
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const action = deferred<WorkforceActivationActionState>();
    mocks.remoteAction.mockReturnValueOnce(action.promise);
    renderWorkspace();
    await act(async () => {
      submit(activationForm(USER_ONE, "ออกลิงก์ใหม่"));
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      action.resolve(activationResult());
      await action.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    root = createRoot(container);
  });
});

describe("Workforce assisted activation handoff", () => {
  it("hands the device over without a success Toast, exposing the link only through the navigation", async () => {
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
    expect(String(replace.mock.calls[0]?.[0])).toContain(`/activate/workforce#${TOKEN}`);
    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("กำลังส่งต่ออุปกรณ์ให้ผู้ใช้งาน");
    expect(container.textContent).not.toContain(TOKEN);
  });

  it("does not repeat the handoff on rerender and locks every other roster action", async () => {
    renderWorkspace();
    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    renderWorkspace();
    await act(async () => submit(activationForm(USER_TWO, "เริ่มแบบช่วยเหลือ")));
    await act(async () => submit(activationForm(USER_TWO, "ออกลิงก์ใหม่")));

    expect(replace).toHaveBeenCalledOnce();
    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
  });

  it("does not hand over when the success result is not the requested user's", async () => {
    mocks.assistedAction.mockResolvedValueOnce(activationResult(USER_TWO));
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(replace).not.toHaveBeenCalled();
    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการเปิดใช้งานแบบช่วยเหลือไม่ได้");
  });

  it("warns for a confirmed conflict without navigating", async () => {
    mocks.assistedAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFLICT",
      message: "ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้ กรุณาตรวจสอบสถานะล่าสุด");
    expect(replace).not.toHaveBeenCalled();
  });

  it("reports a confirmed forbidden response as an error without navigating", async () => {
    mocks.assistedAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการบุคลากรของโรงพยาบาลนี้",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์เริ่มการเปิดใช้งานแบบช่วยเหลือ");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a failure after token issuance as an unknown outcome with no Toast, no redirect and no new credential", async () => {
    mocks.assistedAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ระบบไม่สามารถส่งต่ออุปกรณ์ให้ผู้ใช้งานได้ กรุณาลองใหม่อีกครั้ง",
    });
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(toastCalls()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบไม่สามารถส่งต่ออุปกรณ์ให้ผู้ใช้งานได้");
    expect(container.textContent).toContain("ระบบยังยืนยันผลการเปิดใช้งานแบบช่วยเหลือไม่ได้");
    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));
    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
  });

  it("treats a thrown request as unknown: no Toast, no redirect, no automatic regeneration", async () => {
    mocks.assistedAction.mockRejectedValueOnce(new Error("network lost"));
    renderWorkspace();

    await act(async () => submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ")));

    expect(toastCalls()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการเปิดใช้งานแบบช่วยเหลือไม่ได้");
    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
  });

  it("drops a rapid duplicate start before it can issue a second credential", async () => {
    const action = deferred<WorkforceActivationActionState>();
    mocks.assistedAction.mockReturnValueOnce(action.promise);
    renderWorkspace();

    await act(async () => {
      submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ"));
      submit(activationForm(USER_ONE, "เริ่มแบบช่วยเหลือ"));
      await Promise.resolve();
    });
    await act(async () => {
      action.resolve(activationResult());
      await action.promise;
    });

    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("refuses to start a handoff while an issued link has not been handed over", async () => {
    renderWorkspace();
    await act(async () => submit(activationForm(USER_ONE, "ออกลิงก์ใหม่")));

    expect(activationForm(USER_TWO, "เริ่มแบบช่วยเหลือ").querySelector("button")?.disabled).toBe(true);
    await act(async () => submit(activationForm(USER_TWO, "เริ่มแบบช่วยเหลือ")));

    expect(mocks.assistedAction).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain(TOKEN);
  });
});
