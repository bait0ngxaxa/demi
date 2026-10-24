// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/hospital-onboarding/transport/server-actions", () => ({
  submitHospitalOnboardingAction: vi.fn(),
}));

import { HospitalOnboardingForm } from "./onboarding-form";
import type { OnboardingHospitalOption } from "./hospital-groups";
import { submitHospitalOnboardingAction } from "@/modules/hospital-onboarding/transport/server-actions";

const parentId = "00000000-0000-4000-8000-000000000001";
const childId = "00000000-0000-4000-8000-000000000002";
const duplicateChildId = "00000000-0000-4000-8000-000000000003";
const otherId = "00000000-0000-4000-8000-000000000004";
const parentName = "โรงพยาบาลเครือกลาง";
const childName = "รพ.สต.ลูกข่าย ก";

function hospitalOptions(options: { duplicateChild?: boolean; other?: boolean } = {}): OnboardingHospitalOption[] {
  const hospitals: OnboardingHospitalOption[] = [
    { id: parentId, hospitalCode: "PARENT-001", name: parentName, networkRole: "PARENT" },
    { id: childId, hospitalCode: "CHILD-001", name: childName, networkRole: "CHILD" },
  ];
  if (options.duplicateChild) {
    hospitals.push({ id: duplicateChildId, hospitalCode: "CHILD-002", name: childName, networkRole: "CHILD" });
  }
  if (options.other) {
    hospitals.push({ id: otherId, hospitalCode: "OTHER-001", name: "โรงพยาบาลที่ยังไม่กำหนดประเภท", networkRole: null });
  }
  return hospitals;
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.mocked(submitHospitalOnboardingAction).mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderForm(hospitals: readonly OnboardingHospitalOption[]): void {
  act(() => root.render(createElement(HospitalOnboardingForm, { hospitals })));
}

function buttonByLabel(label: string, index = 0): HTMLButtonElement {
  const matchingButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .filter((button) => (button.getAttribute("aria-label") ?? button.textContent?.trim()) === label);
  const button = matchingButtons[index];
  if (!button) throw new Error(`Missing button named: ${label}`);
  return button;
}

function changeSearch(value: string): void {
  const input = container.querySelector<HTMLInputElement>("#hospitalSearch");
  if (!input) throw new Error("Hospital search input is missing");

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

function selectedHospitalCode(): string {
  return container.querySelector<HTMLInputElement>('input[name="hospitalCode"]')?.value ?? "";
}

function setField(name: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Missing field: ${name}`);
  input.value = value;
}

async function submitOnboardingForm(): Promise<void> {
  const form = container.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Hospital onboarding form is missing");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fillValidOnboardingForm(): void {
  act(() => buttonByLabel(`เลือกโรงพยาบาล ${parentName}`).click());
  setField("givenName", "สมชาย");
  setField("familyName", "ตัวอย่าง");
  setField("nationalId", "1000000000009");
  setField("password", "a-valid-password");
  setField("passwordConfirmation", "a-valid-password");
}

describe("Hospital onboarding selector (ADR-0015 network roles)", () => {
  it("groups Hospitals by network role and submits the selected identity", () => {
    renderForm(hospitalOptions({ other: true }));

    const headings = Array.from(container.querySelectorAll("section[aria-labelledby] h3")).map((heading) => heading.textContent);
    expect(headings).toEqual(["โรงพยาบาลแม่ข่าย", "รพ.สต. / หน่วยบริการลูกข่าย", "โรงพยาบาลอื่น"]);

    act(() => buttonByLabel(`เลือกโรงพยาบาล ${childName}`).click());

    expect(selectedHospitalCode()).toBe("CHILD-001");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`เลือกแล้ว: ${childName} รพ.สต. / หน่วยบริการลูกข่าย`);
  });

  it("selects a Parent and labels it by role", () => {
    renderForm(hospitalOptions());

    act(() => buttonByLabel(`เลือกโรงพยาบาล ${parentName}`).click());

    expect(selectedHospitalCode()).toBe("PARENT-001");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`เลือกแล้ว: ${parentName} โรงพยาบาลแม่ข่าย`);
  });

  it("filters every group by name and hides empty groups", () => {
    renderForm(hospitalOptions({ other: true }));
    changeSearch("ลูกข่าย ก");

    const region = container.querySelector('[role="region"][aria-label="รายการโรงพยาบาลที่เลือกได้"]');
    expect(region?.textContent).toContain(childName);
    expect(region?.textContent).not.toContain(parentName);
    expect(region?.textContent).not.toContain("โรงพยาบาลอื่น");
  });

  it("preserves separate identities for duplicate Hospital names", () => {
    renderForm(hospitalOptions({ duplicateChild: true }));
    const label = `เลือกโรงพยาบาล ${childName}`;

    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-label]"))
        .filter((button) => button.getAttribute("aria-label") === label),
    ).toHaveLength(2);

    act(() => buttonByLabel(label, 1).click());

    expect(selectedHospitalCode()).toBe("CHILD-002");
  });

  it("distinguishes an empty eligible list from a search with no matches", () => {
    renderForm([]);
    expect(container.textContent).toContain("ยังไม่มีโรงพยาบาลที่เปิดรับคำขอในขณะนี้");

    act(() => root.render(createElement(HospitalOnboardingForm, { hospitals: hospitalOptions() })));
    changeSearch("โรงพยาบาลที่ไม่มีในระบบ");
    expect(container.textContent).toContain("ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา");
    expect(container.textContent).not.toContain("ยังไม่มีโรงพยาบาลที่เปิดรับคำขอในขณะนี้");
  });

  it("uses native keyboard-operable buttons, named groups, and returns focus after selection", () => {
    renderForm(hospitalOptions());
    const group = container.querySelector("section[aria-labelledby]");
    const headingId = group?.getAttribute("aria-labelledby");
    const option = buttonByLabel(`เลือกโรงพยาบาล ${childName}`);

    expect(headingId && document.getElementById(headingId)?.textContent).toBe("โรงพยาบาลแม่ข่าย");
    expect(option.type).toBe("button");
    expect(option.tabIndex).toBe(0);
    expect(option.getAttribute("role")).toBeNull();
    expect(option.className).toContain("focus-visible:ring");

    act(() => option.click());

    expect(document.activeElement).toBe(buttonByLabel("เปลี่ยนโรงพยาบาล"));

    act(() => buttonByLabel("เปลี่ยนโรงพยาบาล").click());
    expect(document.activeElement).toBe(container.querySelector("#hospitalSearch"));
  });

  it("does not expose Hospital codes in visible copy or accessible names", () => {
    renderForm(hospitalOptions({ other: true }));

    const accessibleLabels = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"))
      .map((element) => element.getAttribute("aria-label") ?? "")
      .join(" ");
    for (const code of ["PARENT-001", "CHILD-001", "OTHER-001"]) {
      expect(container.textContent).not.toContain(code);
      expect(accessibleLabels).not.toContain(code);
    }
  });

  it("clearly says a submitted request is waiting for review, not approved", async () => {
    vi.mocked(submitHospitalOnboardingAction).mockResolvedValue({ status: "SUCCESS" });
    renderForm(hospitalOptions());
    fillValidOnboardingForm();

    await submitOnboardingForm();

    expect(container.textContent).toContain("ส่งคำขอเรียบร้อยแล้ว");
    expect(container.textContent).toContain("ระบบได้รับคำขอของคุณแล้ว");
    expect(container.textContent).toContain("รอผู้ดูแลระบบตรวจสอบและอนุมัติก่อนเข้าสู่ระบบ");
    expect(container.querySelector('a[href="/login"]')?.textContent).toContain("กลับไปหน้าเข้าสู่ระบบ");
    expect(container.querySelector("form")).toBeNull();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("off");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.activeElement).toBe(status);
    expect(container.textContent).not.toContain("ได้รับอนุมัติแล้ว");
  });

  it("focuses correctable fields and preserves entered values after validation errors", async () => {
    vi.mocked(submitHospitalOnboardingAction).mockResolvedValue({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: { givenName: "กรุณากรอกชื่อ" },
    });
    renderForm(hospitalOptions());
    fillValidOnboardingForm();

    await submitOnboardingForm();

    const givenName = container.querySelector<HTMLInputElement>('[name="givenName"]');
    expect(givenName?.value).toBe("สมชาย");
    expect(givenName?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(givenName);
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).not.toContain("raw internal detail");
  });
});
