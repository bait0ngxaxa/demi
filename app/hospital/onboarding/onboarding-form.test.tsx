// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/hospital-onboarding/transport/server-actions", () => ({
  submitHospitalOnboardingAction: vi.fn(),
}));

import { HospitalOnboardingForm } from "./onboarding-form";
import type { OnboardingHospitalOption } from "./hospital-groups";

const parentId = "00000000-0000-4000-8000-000000000001";
const childId = "00000000-0000-4000-8000-000000000002";
const duplicateChildId = "00000000-0000-4000-8000-000000000003";
const ungroupedId = "00000000-0000-4000-8000-000000000004";
const parentName = "โรงพยาบาลเครือกลาง";
const childName = "โรงพยาบาลลูกข่าย ก";

const parentRelationship = {
  id: parentId,
  name: parentName,
  parentHospitalId: null,
};

function hospitalOptions(options: {
  eligibleParent?: boolean;
  duplicateChild?: boolean;
  ungrouped?: boolean;
} = {}): OnboardingHospitalOption[] {
  const hospitals: OnboardingHospitalOption[] = [
    {
      id: childId,
      hospitalCode: "CHILD-CANONICAL-001",
      name: childName,
      parentHospitalId: parentId,
      parentHospital: parentRelationship,
    },
  ];

  if (options.eligibleParent) {
    hospitals.push({
      id: parentId,
      hospitalCode: "PARENT-CANONICAL-001",
      name: parentName,
      parentHospitalId: null,
      parentHospital: null,
    });
  }
  if (options.duplicateChild) {
    hospitals.push({
      id: duplicateChildId,
      hospitalCode: "CHILD-CANONICAL-002",
      name: childName,
      parentHospitalId: parentId,
      parentHospital: parentRelationship,
    });
  }
  if (options.ungrouped) {
    hospitals.push({
      id: ungroupedId,
      hospitalCode: "OTHER-CANONICAL-001",
      name: "โรงพยาบาลที่ไม่มีแม่ข่าย",
      parentHospitalId: null,
      parentHospital: null,
    });
  }

  return hospitals;
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
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

describe("Hospital onboarding network selector", () => {
  it("submits the selected child's canonical identity and keeps its parent context visible", () => {
    renderForm(hospitalOptions());

    act(() => buttonByLabel(`เลือกโรงพยาบาล ${childName} ในเครือ ${parentName}`).click());

    expect(selectedHospitalCode()).toBe("CHILD-CANONICAL-001");
    expect(container.textContent).toContain(childName);
    expect(container.textContent).toContain(`โรงพยาบาลในเครือ ${parentName}`);
    expect(container.textContent).not.toContain("CHILD-CANONICAL-001");
  });

  it("lets an eligible parent be selected independently from its children", () => {
    renderForm(hospitalOptions({ eligibleParent: true }));

    act(() => buttonByLabel(`เลือกโรงพยาบาลแม่ข่าย ${parentName}`).click());

    expect(selectedHospitalCode()).toBe("PARENT-CANONICAL-001");
    expect(container.textContent).toContain("โรงพยาบาลแม่ข่าย");
    expect(container.textContent).not.toContain("PARENT-CANONICAL-001");
  });

  it("shows a non-eligible parent as a heading only", () => {
    renderForm(hospitalOptions());

    expect(container.textContent).toContain(`เครือข่าย: ${parentName}`);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-label]"))
        .some((button) => button.getAttribute("aria-label") === `เลือกโรงพยาบาลแม่ข่าย ${parentName}`),
    ).toBe(false);
    expect(buttonByLabel(`เลือกโรงพยาบาล ${childName} ในเครือ ${parentName}`)).toBeTruthy();
  });

  it("searching by parent name shows its eligible children", () => {
    renderForm(hospitalOptions({ eligibleParent: true }));
    changeSearch("เครือกลาง");

    expect(container.textContent).toContain(`เครือข่าย: ${parentName}`);
    expect(buttonByLabel(`เลือกโรงพยาบาล ${childName} ในเครือ ${parentName}`)).toBeTruthy();
    expect(buttonByLabel(`เลือกโรงพยาบาลแม่ข่าย ${parentName}`)).toBeTruthy();
  });

  it("searching by child name retains the parent group context", () => {
    renderForm(hospitalOptions());
    changeSearch("ลูกข่าย ก");

    const region = container.querySelector('[role="region"][aria-label="รายการโรงพยาบาลที่เลือกได้"]');
    expect(region?.textContent).toContain(`เครือข่าย: ${parentName}`);
    expect(region?.textContent).toContain(childName);
  });

  it("keeps an ungrouped Hospital selectable without creating a network", () => {
    renderForm(hospitalOptions({ ungrouped: true }));

    act(() => buttonByLabel("เลือกโรงพยาบาล โรงพยาบาลที่ไม่มีแม่ข่าย").click());

    expect(selectedHospitalCode()).toBe("OTHER-CANONICAL-001");
    expect(container.textContent).toContain("เลือกแล้ว: โรงพยาบาลที่ไม่มีแม่ข่าย");
  });

  it("preserves separate identities for duplicate Hospital names", () => {
    renderForm(hospitalOptions({ duplicateChild: true }));
    const duplicateLabel = `เลือกโรงพยาบาล ${childName} ในเครือ ${parentName}`;

    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-label]"))
        .filter((button) => button.getAttribute("aria-label") === duplicateLabel),
    ).toHaveLength(2);

    act(() => buttonByLabel(duplicateLabel, 1).click());

    expect(selectedHospitalCode()).toBe("CHILD-CANONICAL-002");
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
    const option = buttonByLabel(`เลือกโรงพยาบาล ${childName} ในเครือ ${parentName}`);

    expect(group).toBeTruthy();
    expect(headingId && document.getElementById(headingId)?.textContent).toBe(
      `เครือข่าย: ${parentName}`,
    );
    expect(option.type).toBe("button");
    expect(option.tabIndex).toBe(0);
    expect(option.getAttribute("role")).toBeNull();
    expect(option.className).toContain("focus-visible:ring");

    act(() => option.click());

    expect(document.activeElement).toBe(buttonByLabel("เปลี่ยนโรงพยาบาล"));
    expect(container.querySelector('[role="status"]')?.textContent).toContain(parentName);

    act(() => buttonByLabel("เปลี่ยนโรงพยาบาล").click());
    expect(document.activeElement).toBe(container.querySelector("#hospitalSearch"));
  });

  it("does not expose Hospital codes in visible copy or accessible names", () => {
    renderForm(hospitalOptions({ eligibleParent: true }));

    expect(container.textContent).not.toContain("CHILD-CANONICAL-001");
    expect(container.textContent).not.toContain("PARENT-CANONICAL-001");
    const accessibleLabels = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"))
      .map((element) => element.getAttribute("aria-label") ?? "")
      .join(" ");
    expect(accessibleLabels).not.toContain("CHILD-CANONICAL-001");
    expect(accessibleLabels).not.toContain("PARENT-CANONICAL-001");
  });
});
