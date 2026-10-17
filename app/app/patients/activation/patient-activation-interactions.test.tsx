// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  issue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
  notifyError: vi.fn<(message: string) => void>(),
  notifyInfo: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: mocks.notifyInfo,
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("@/modules/patient-activation/transport/server-actions", () => ({
  findPatientActivationCandidatesAction: mocks.find,
  issuePatientActivationAction: mocks.issue,
}));

import type { PatientActivationCandidateState } from "@/modules/patient-activation/transport/action-state";
import { PatientActivationActionsWorkspace } from "./patient-activation-actions-workspace";

const scope = { hospitalId: "hospital-1", hospitalCode: "H001", hospitalName: "โรงพยาบาลทดสอบ" };
const candidate = {
  userId: "user-1",
  hospitalId: "hospital-1",
  displayName: "สมชาย ใจดี",
  hospitalNumber: "HN-001",
  accountStatus: "PROVISIONED",
  activationStatus: "NOT_ISSUED",
} as unknown as PatientActivationCandidateState;

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.find.mockReset();
  mocks.issue.mockReset();
  mocks.notifyError.mockReset();
  mocks.notifyInfo.mockReset();
  mocks.notifySuccess.mockReset();
  mocks.notifyWarning.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(PatientActivationActionsWorkspace, {
        scopes: [scope] as never,
        selectedHospitalId: scope.hospitalId,
        selectedScope: scope as never,
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function searchInput(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[name="value"]')!;
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function search(value: string): Promise<void> {
  searchInput().value = value;
  await act(async () => {
    buttonByText("ค้นหา").click();
  });
}

describe("Patient activation search and link issuance", () => {
  it("keeps the search term after a search and shows the empty result distinctly", async () => {
    mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [] });

    await search("สมชาย");

    expect(searchInput().value).toBe("สมชาย");
    expect(container.textContent).toContain("ไม่พบผู้ป่วยตามข้อมูลค้นหา");
  });

  it("turns an unreachable search into a retryable error instead of an empty result", async () => {
    mocks.find.mockRejectedValue(new TypeError("Failed to fetch"));

    await search("สมชาย");

    expect(container.textContent).toContain("เชื่อมต่อระบบไม่สำเร็จ");
    expect(container.textContent).not.toContain("ไม่พบผู้ป่วยตามข้อมูลค้นหา");
    expect(buttonByText("ค้นหา").disabled).toBe(false);
    expect(searchInput().value).toBe("สมชาย");
  });

  it("does not offer another link issue after an unconfirmed issue request", async () => {
    mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [candidate] });
    await search("สมชาย");
    mocks.issue.mockRejectedValue(new TypeError("Failed to fetch"));

    const issueButton = container.querySelector<HTMLButtonElement>("article form button[type=submit]")!;
    await act(async () => {
      issueButton.click();
    });

    const article = container.querySelector("article")!;
    expect(article.querySelector('[role="alert"]')?.textContent).toContain("ระบบอาจออกลิงก์แล้ว");
    expect(article.querySelector('[role="alert"]')?.textContent).toContain("ลิงก์เดิมแสดงซ้ำไม่ได้");
    expect(article.querySelector("form")).toBeNull();
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("labels an issued link without implying that the patient activated the account", async () => {
    mocks.find.mockResolvedValue({
      status: "SUCCESS",
      candidates: [{ ...candidate, activationStatus: "ISSUED" }],
    });

    await search("สมชาย");

    const article = container.querySelector("article")!;
    expect(article.textContent).toContain("ออกลิงก์แล้ว");
    expect(article.textContent).not.toContain("เปิดใช้งานแล้ว");
    expect(article.textContent).toContain("ลิงก์เดิมแสดงซ้ำไม่ได้");
    expect(article.textContent).toContain("ระบบจะยกเลิกลิงก์เดิมทันที");
  });
  describe("issuance feedback", () => {
    const token = "one-time-secret-token";

    function issued(overrides: Record<string, unknown> = {}) {
      return {
        status: "SUCCESS",
        result: {
          outcome: "ISSUED",
          userId: "user-1",
          patientProfileId: "profile-1",
          hospitalId: "hospital-1",
          activationToken: token,
          activationExpiresAt: "2026-10-20T00:00:00.000Z",
          ...overrides,
        },
      };
    }

    async function searchAndIssue(): Promise<void> {
      mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [candidate] });
      await search("สมชาย");
      await act(async () => {
        container.querySelector<HTMLButtonElement>("article form button[type=submit]")!.click();
      });
    }

    function allNotifyText(): string {
      return JSON.stringify([
        mocks.notifySuccess.mock.calls,
        mocks.notifyWarning.mock.calls,
        mocks.notifyError.mock.calls,
        mocks.notifyInfo.mock.calls,
      ]);
    }

    it("shows one success Toast for ISSUED, keeps the token inline only, and never replays", async () => {
      mocks.issue.mockResolvedValue(issued());

      await searchAndIssue();

      expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
      expect(mocks.notifySuccess).toHaveBeenCalledWith("ออกลิงก์เปิดใช้งานแล้ว");
      expect(allNotifyText()).not.toContain(token);
      expect(allNotifyText()).not.toContain("สมชาย");
      expect(container.textContent).toContain("ลิงก์เปิดใช้งานพร้อมส่งต่อ");
      expect(container.textContent).toContain(token);

      await act(async () => {
        root.render(
          createElement(PatientActivationActionsWorkspace, {
            scopes: [scope] as never,
            selectedHospitalId: scope.hospitalId,
            selectedScope: scope as never,
          }),
        );
      });
      expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain(token);
    });

    it.each(["ALREADY_ISSUED", "ALREADY_ACTIVE", "RECONCILIATION_REQUIRED"])(
      "gives no Toast for %s",
      async (outcome) => {
        mocks.issue.mockResolvedValue(issued({ outcome, activationToken: null }));

        await searchAndIssue();

        expect(allNotifyText()).toBe("[[],[],[],[]]");
      },
    );

    it("keeps reconciliation errors inline without a Toast", async () => {
      mocks.issue.mockResolvedValue({
        status: "ERROR",
        code: "RECONCILIATION_REQUIRED",
        message: "บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์ใหม่",
      });

      await searchAndIssue();

      expect(container.textContent).toContain("บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์ใหม่");
      expect(allNotifyText()).toBe("[[],[],[],[]]");
    });

    it("keeps invalid input inline without a Toast", async () => {
      mocks.issue.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "ไม่สามารถออกลิงก์เปิดใช้งานได้" });

      await searchAndIssue();

      expect(container.textContent).toContain("ไม่สามารถออกลิงก์เปิดใช้งานได้");
      expect(allNotifyText()).toBe("[[],[],[],[]]");
    });

    it("warns on CONFLICT and reports FORBIDDEN with a static error", async () => {
      mocks.issue.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "ขัดแย้ง" });
      await searchAndIssue();
      expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("ขัดแย้ง");
      expect(container.querySelector("article form")).not.toBeNull();

      mocks.issue.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
      await act(async () => {
        container.querySelector<HTMLButtonElement>("article form button[type=submit]")!.click();
      });
      expect(mocks.notifyError).toHaveBeenCalledTimes(1);
      expect(mocks.notifySuccess).not.toHaveBeenCalled();
    });

    it.each([
      ["returned UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }],
      ["returned IDLE", { status: "IDLE" }],
      ["a result for another Patient", issued({ userId: "user-2" })],
      ["a result for another Hospital", issued({ hospitalId: "hospital-2" })],
      ["ISSUED without a token", issued({ activationToken: null })],
    ])("treats %s as unconfirmed: no Toast, no automatic reissue", async (_label, response) => {
      mocks.issue.mockResolvedValue(response);

      await searchAndIssue();

      const article = container.querySelector("article")!;
      expect(article.querySelector('[role="alert"]')?.textContent).toContain("ระบบอาจออกลิงก์แล้ว");
      expect(article.querySelector("form")).toBeNull();
      expect(mocks.issue).toHaveBeenCalledTimes(1);
      expect(allNotifyText()).toBe("[[],[],[],[]]");
    });

    it("sends one request for two synchronous submits", async () => {
      mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [candidate] });
      await search("สมชาย");
      let resolveIssue: (value: unknown) => void = () => undefined;
      mocks.issue.mockReturnValue(new Promise((resolve) => { resolveIssue = resolve; }));

      await act(async () => {
        const form = container.querySelector<HTMLFormElement>("article form")!;
        form.requestSubmit();
        form.requestSubmit();
      });

      expect(mocks.issue).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveIssue({ status: "ERROR", code: "INVALID_INPUT", message: "x" });
      });
    });

    it("gives no Toast when the workspace unmounts before the response", async () => {
      mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [candidate] });
      await search("สมชาย");
      let resolveIssue: (value: unknown) => void = () => undefined;
      mocks.issue.mockReturnValue(new Promise((resolve) => { resolveIssue = resolve; }));
      await act(async () => {
        container.querySelector<HTMLButtonElement>("article form button[type=submit]")!.click();
      });

      act(() => root.unmount());
      root = createRoot(container);
      await act(async () => {
        resolveIssue(issued());
      });

      expect(allNotifyText()).toBe("[[],[],[],[]]");
      expect(container.textContent).not.toContain(token);
    });
  });

  describe("lookup feedback", () => {
    it("reports a confirmed access denial with a static error", async () => {
      mocks.find.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });

      await search("สมชาย");

      expect(mocks.notifyError).toHaveBeenCalledTimes(1);
      expect(mocks.notifyError).toHaveBeenCalledWith("ไม่มีสิทธิ์ค้นหาผู้ป่วยเพื่อเปิดใช้งานบัญชี");
    });

    it("gives no Toast for results, empty results or ambiguity", async () => {
      mocks.find.mockResolvedValue({ status: "SUCCESS", candidates: [candidate] });
      await search("สมชาย");
      mocks.find.mockResolvedValue({ status: "ERROR", code: "TOO_MANY_RESULTS", message: "พบหลายรายการ" });
      await search("สม");

      expect(mocks.notifySuccess).not.toHaveBeenCalled();
      expect(mocks.notifyWarning).not.toHaveBeenCalled();
      expect(mocks.notifyError).not.toHaveBeenCalled();
    });
  });
});
