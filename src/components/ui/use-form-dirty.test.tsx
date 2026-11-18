// @vitest-environment jsdom

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { formValuesSnapshot, useFormDirty } from "./use-form-dirty";

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

function Probe({ savedKey, ignore }: { savedKey?: unknown; ignore?: readonly string[] }): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useFormDirty(formRef, { savedKey, ignore });
  return (
    <form ref={formRef}>
      <input defaultValue="3" name="expectedVersion" type="hidden" />
      <input defaultValue="nonce-1" name="submissionNonce" type="hidden" />
      <input defaultValue="a" name="uiOnly" />
      <input defaultValue="สมชาย" name="givenName" />
      <textarea defaultValue="" name="note" />
      <select defaultValue="UNKNOWN" name="diabetes">
        <option value="UNKNOWN">ไม่ทราบ</option>
        <option value="YES">มี</option>
      </select>
      <input defaultChecked name="level" type="radio" value="LOW" />
      <input name="level" type="radio" value="HIGH" />
      <input name="agree" type="checkbox" value="yes" />
      <output data-dirty={String(dirty)} />
    </form>
  );
}

function render(props: { savedKey?: unknown; ignore?: readonly string[] } = {}): void {
  act(() => root.render(createElement(Probe, props)));
}

function dirty(): string | null {
  return container.querySelector("output")!.getAttribute("data-dirty");
}

function element<T extends Element>(selector: string): T {
  return container.querySelector<T>(selector)!;
}

function type(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  act(() => {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function toggle(field: HTMLInputElement): void {
  act(() => field.click());
}

describe("useFormDirty", () => {
  it("starts clean, becomes dirty on edit and clean again when typed back", () => {
    render();
    expect(dirty()).toBe("false");

    type(element('[name="givenName"]'), "สมหญิง");
    expect(dirty()).toBe("true");

    type(element('[name="givenName"]'), "สมชาย");
    expect(dirty()).toBe("false");
  });

  it.each([
    ["textarea", () => type(element('[name="note"]'), "เพิ่มเติม")],
    ["select", () => {
      const select = element<HTMLSelectElement>('[name="diabetes"]');
      act(() => {
        select.value = "YES";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }],
    ["radio", () => toggle(element('[name="level"][value="HIGH"]'))],
    ["checkbox", () => toggle(element('[name="agree"]'))],
  ])("tracks a %s", (_label, edit) => {
    render();
    edit();
    expect(dirty()).toBe("true");
  });

  it("rebaselines on a new savedKey and keeps edits dirty while the key is undefined", () => {
    render({ savedKey: undefined });
    type(element('[name="givenName"]'), "สมหญิง");
    render({ savedKey: undefined });
    expect(dirty()).toBe("true");

    render({ savedKey: { status: "SUCCESS" } });
    expect(dirty()).toBe("false");

    type(element('[name="givenName"]'), "สมชาย");
    expect(dirty()).toBe("true");
  });

  it("never counts submission identity or ignored fields", () => {
    render({ ignore: ["uiOnly"] });
    type(element('[name="expectedVersion"]'), "4");
    type(element('[name="submissionNonce"]'), "nonce-2");
    type(element('[name="uiOnly"]'), "b");
    expect(dirty()).toBe("false");
  });

  it("recomputes after a form reset", async () => {
    render();
    type(element('[name="givenName"]'), "สมหญิง");
    expect(dirty()).toBe("true");

    await act(async () => {
      element<HTMLFormElement>("form").reset();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(dirty()).toBe("false");
  });
});

describe("formValuesSnapshot", () => {
  it("skips File entries and Next.js action internals", () => {
    const form = document.createElement("form");
    form.innerHTML = '<input name="$ACTION_ID_abc" value="x"><input type="file" name="evidence"><input name="b" value="2"><input name="a" value="1">';
    expect(formValuesSnapshot(form)).toBe(JSON.stringify([["a", "1"], ["b", "2"]]));
  });
});
