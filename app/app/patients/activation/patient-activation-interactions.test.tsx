// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  issue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
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
});
