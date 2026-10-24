// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form {...props}>{children}</form> }));

import { HospitalReportTargetSelector } from "./hospital-report-target-selector";

const hospitals = [
  { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลหนึ่ง", hospitalCode: "ONE", status: "ACTIVE" as const },
  { id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาลสอง", hospitalCode: "TWO", status: "ACTIVE" as const },
];

describe("accessible own-hospital report picker", () => {
  it("changes selection without submitting and submits the selected Hospital only on button activation", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(function (this: HTMLFormElement) {
      this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    try {
      await act(async () => root.render(<HospitalReportTargetSelector hospitals={hospitals} parentGroups={[]}
        selection={{ kind: "DIRECT_OWNER", hospitalId: hospitals[0].id }} routeBase="/app/hospitals/reporting" />));
      const form = container.querySelector("form");
      const select = container.querySelector("select");
      if (!form || !select) throw new Error("Expected an own-hospital picker form");
      const submissions: FormData[] = [];
      form.addEventListener("submit", (event) => { event.preventDefault(); submissions.push(new FormData(form)); });
      await act(async () => {
        select.value = hospitals[1].id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(submissions).toHaveLength(0);
      expect(requestSubmit).not.toHaveBeenCalled();
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (!button) throw new Error("Expected an explicit เปิดรายงาน button");
      expect(button.closest("noscript")).toBeNull();
      expect(button.textContent).toBe("เปิดรายงาน");
      await act(async () => button.click());
      expect(submissions).toHaveLength(1);
      expect(submissions[0].get("hospitalId")).toBe(hospitals[1].id);
    } finally {
      await act(async () => root.unmount());
      requestSubmit.mockRestore();
      container.remove();
    }
  });
});
