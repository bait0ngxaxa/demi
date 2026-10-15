// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { PendingSubmitButton } from "./pending-submit-button";

it("shows the pending label and blocks repeat submits while its form is submitting", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let finish: () => void = () => undefined;
  let submissions = 0;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        "form",
        {
          action: () => {
            submissions += 1;
            return new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
        },
        createElement(PendingSubmitButton, { pendingLabel: "กำลังค้นหา..." }, "ค้นหา"),
      ),
    );
  });
  const button = container.querySelector("button")!;

  await act(async () => {
    button.click();
  });
  expect(button.textContent).toBe("กำลังค้นหา...");
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  await act(async () => {
    button.click();
  });
  expect(submissions).toBe(1);

  await act(async () => {
    finish();
  });
  expect(button.textContent).toBe("ค้นหา");
  expect(button.disabled).toBe(false);

  act(() => root.unmount());
  container.remove();
});
