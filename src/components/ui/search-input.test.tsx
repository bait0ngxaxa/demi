// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchInput, type SearchInputProps } from "./search-input";

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

function input(): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("SearchInput did not render");
  return element;
}

function clearButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>("button");
}

function type(text: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" });
  act(() => {
    input().dispatchEvent(event);
  });
  return event;
}

function Controlled({ onValue, ...props }: Omit<SearchInputProps, "value" | "onChange"> & { onValue?: (value: string) => void }): React.JSX.Element {
  const [value, setValue] = useState("กรุงเทพ");
  return createElement(SearchInput, {
    ...props,
    onChange: (event) => {
      setValue(event.target.value);
      onValue?.(event.target.value);
    },
    value,
  });
}

let submitted = 0;

function inForm(child: React.ReactElement): React.ReactElement {
  return createElement(
    "form",
    {
      onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submitted += 1;
      },
    },
    child,
  );
}

function mountInForm(props: SearchInputProps): { submits: () => number } {
  submitted = 0;
  act(() => root.render(inForm(createElement(SearchInput, props))));
  return { submits: () => submitted };
}

describe("SearchInput", () => {
  it("is a search field with the shared 48px styling and room for the clear button", () => {
    act(() => root.render(createElement(SearchInput, { name: "search" })));
    expect(input().type).toBe("search");
    expect(input().className).toContain("min-h-12");
    expect(input().className).toContain("pe-12");
  });

  it("hides the clear button while empty, disabled or read-only", () => {
    act(() => root.render(createElement(SearchInput, { name: "search" })));
    expect(clearButton()).toBeNull();

    act(() => root.render(createElement(SearchInput, { defaultValue: "สมชาย", disabled: true, name: "search" })));
    expect(clearButton()).toBeNull();

    act(() => root.render(createElement(SearchInput, { readOnly: true, value: "สมชาย" })));
    expect(clearButton()).toBeNull();
  });

  it("shows the clear button after typing into an uncontrolled field and hides it again when emptied", () => {
    act(() => root.render(createElement(SearchInput, { name: "search" })));
    type("ส");
    expect(clearButton()).not.toBeNull();
    type("");
    expect(clearButton()).toBeNull();
  });

  it("is a labelled, non-submitting button", () => {
    act(() => root.render(createElement(SearchInput, { defaultValue: "สมชาย", id: "q" })));
    const button = clearButton();
    expect(button?.type).toBe("button");
    expect(button?.getAttribute("aria-label")).toBe("ล้างคำค้นหา");
    expect(button?.getAttribute("aria-controls")).toBe("q");
  });

  it("clears a controlled field through onChange, calls onClear and focuses the field", () => {
    const values: string[] = [];
    const onClear = vi.fn();
    act(() => root.render(createElement(Controlled, { onClear, onValue: (value) => values.push(value) })));
    expect(clearButton()).not.toBeNull();

    act(() => clearButton()?.click());
    expect(values).toEqual([""]);
    expect(input().value).toBe("");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input());
    expect(clearButton()).toBeNull();
  });

  it("clears on Escape and leaves Escape alone when clearOnEscape is off", () => {
    const values: string[] = [];
    act(() => root.render(createElement(Controlled, { onValue: (value) => values.push(value) })));
    expect(pressEscape().defaultPrevented).toBe(true);
    expect(values).toEqual([""]);

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(createElement(Controlled, { clearOnEscape: false, onValue: (value) => values.push(value) })));
    expect(pressEscape().defaultPrevented).toBe(false);
    expect(input().value).toBe("กรุงเทพ");
  });

  it("does not clear on Escape when the caller's key handler already handled it", () => {
    act(() => root.render(createElement(Controlled, { onKeyDown: (event) => event.preventDefault() })));
    pressEscape();
    expect(input().value).toBe("กรุงเทพ");
  });

  it("auto-submits an uncontrolled field that rendered with a value, so results reset", () => {
    const { submits } = mountInForm({ defaultValue: "สมชาย", name: "search" });
    act(() => clearButton()?.click());
    expect(input().value).toBe("");
    expect(submits()).toBe(1);
  });

  it("does not auto-submit a field that started empty or is controlled", () => {
    const { submits } = mountInForm({ name: "search" });
    type("สมชาย");
    act(() => clearButton()?.click());
    expect(input().value).toBe("");
    expect(submits()).toBe(0);

    act(() => root.render(inForm(createElement(Controlled, {}))));
    act(() => clearButton()?.click());
    expect(submits()).toBe(0);
  });

  it("follows an explicit submitOnClear", () => {
    const { submits } = mountInForm({ defaultValue: "สมชาย", name: "search", submitOnClear: false });
    act(() => clearButton()?.click());
    expect(submits()).toBe(0);

    act(() => root.render(inForm(createElement(Controlled, { submitOnClear: true }))));
    act(() => clearButton()?.click());
    expect(submits()).toBe(1);
  });

  it("forwards the ref to the input", () => {
    const ref = { current: null as HTMLInputElement | null };
    act(() => root.render(createElement(SearchInput, { ref })));
    expect(ref.current).toBe(input());
  });
});
