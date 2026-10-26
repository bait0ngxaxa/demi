// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PasswordInput } from "./password-input";

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

function mount(props: Partial<Parameters<typeof PasswordInput>[0]> = {}): { input: HTMLInputElement; toggle: HTMLButtonElement } {
  act(() => root.render(createElement(PasswordInput, { autoComplete: "new-password", id: "secret", name: "password", ...props })));
  const input = container.querySelector<HTMLInputElement>("#secret");
  const toggle = container.querySelector<HTMLButtonElement>("button");
  if (!input || !toggle) throw new Error("PasswordInput did not render");
  return { input, toggle };
}

describe("PasswordInput", () => {
  it("starts hidden and keeps the shown state until the toggle is pressed again", () => {
    const { input, toggle } = mount();
    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    act(() => toggle.click());
    expect(input.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.title).toBe("ซ่อนรหัสผ่าน");
    // Persistent: still shown after time passes and other interaction.
    act(() => input.focus());
    expect(input.type).toBe("text");

    act(() => toggle.click());
    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.title).toBe("แสดงรหัสผ่าน");
  });

  it("toggles without changing the value, name or autocomplete, and never submits the form", () => {
    let submitted = 0;
    act(() => root.unmount());
    const form = document.createElement("form");
    form.addEventListener("submit", (event) => { event.preventDefault(); submitted += 1; });
    container.append(form);
    root = createRoot(form);
    const { input, toggle } = mount({ defaultValue: "รหัสผ่านทดสอบ-123" });

    act(() => toggle.click());

    expect(input.value).toBe("รหัสผ่านทดสอบ-123");
    expect(input.name).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    expect(toggle.type).toBe("button");
    expect(toggle.getAttribute("aria-controls")).toBe("secret");
    expect(toggle.getAttribute("aria-label")).toBe("แสดงรหัสผ่าน");
    expect(submitted).toBe(0);
  });

  it("disables the toggle with its field", () => {
    const { input, toggle } = mount({ disabled: true });
    expect(input.disabled).toBe(true);
    expect(toggle.disabled).toBe(true);
  });
});
