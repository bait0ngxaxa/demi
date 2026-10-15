// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { submitPreservingInput, useMutationActionState } from "./mutation-action-state";
import { UnknownOutcomeAlert } from "./unknown-outcome-alert";

type State = { status: "IDLE" | "SUCCESS" | "ERROR"; message: string };
type Runner = (formData: FormData) => Promise<State>;

function Harness({ run }: { run: Runner }): React.JSX.Element {
  const [state, dispatch, pending, unknownOutcome] = useMutationActionState<State, FormData>(
    async (_previous, formData) => run(formData),
    { status: "IDLE", message: "" },
  );

  return createElement(
    "form",
    { action: dispatch, onSubmit: submitPreservingInput(dispatch) },
    createElement("input", { "data-testid": "note", name: "note" }),
    createElement(
      "button",
      { "data-testid": "submit", disabled: pending || unknownOutcome, name: "intent", type: "submit", value: "save" },
      "บันทึก",
    ),
    createElement("p", { "data-testid": "status" }, state.status),
    createElement(UnknownOutcomeAlert, { active: unknownOutcome }),
  );
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mount(run: Runner): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { run })));
}

const query = <T extends Element>(selector: string): T => container.querySelector<T>(selector)!;

async function submit(value: string): Promise<void> {
  query<HTMLInputElement>("[data-testid=note]").value = value;
  await act(async () => {
    query<HTMLButtonElement>("[data-testid=submit]").click();
  });
}

describe("useMutationActionState", () => {
  it("keeps typed input and submitter value when the server returns a validation error", async () => {
    const run = vi.fn<Runner>(async () => ({ status: "ERROR", message: "ข้อมูลไม่ถูกต้อง" }));
    mount(run);

    await submit("บันทึกร่าง");

    expect(run.mock.calls[0]?.[0].get("note")).toBe("บันทึกร่าง");
    expect(run.mock.calls[0]?.[0].get("intent")).toBe("save");
    expect(query("[data-testid=status]").textContent).toBe("ERROR");
    expect(query<HTMLInputElement>("[data-testid=note]").value).toBe("บันทึกร่าง");
  });

  it("reports an unknown outcome instead of throwing when the request fails", async () => {
    mount(async () => {
      throw new TypeError("Failed to fetch");
    });

    await submit("ข้อมูลเดิม");

    expect(query("[data-testid=status]").textContent).toBe("IDLE");
    expect(query('[role="alert"]').textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(query<HTMLButtonElement>("[data-testid=submit]").disabled).toBe(true);
    expect(query<HTMLInputElement>("[data-testid=note]").value).toBe("ข้อมูลเดิม");
  });

  it("does not resubmit on its own and offers a reload as the recovery step", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const run = vi.fn<Runner>(async () => {
      throw new Error("network");
    });
    mount(run);

    await submit("ครั้งเดียว");
    await act(async () => {
      query<HTMLButtonElement>("[data-testid=submit]").click();
    });
    expect(run).toHaveBeenCalledTimes(1);

    await act(async () => {
      query<HTMLButtonElement>('[role="alert"] button').click();
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rethrows Next.js navigation signals instead of reporting an unknown outcome", async () => {
    const { redirect } = await import("next/navigation");
    const errors: unknown[] = [];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
    act(() =>
      root.render(
        createElement(Harness, {
          run: async () => redirect("/app"),
        }),
      ),
    );

    query<HTMLInputElement>("[data-testid=note]").value = "ไปหน้าถัดไป";
    try {
      await act(async () => {
        query<HTMLButtonElement>("[data-testid=submit]").click();
      });
    } catch (error) {
      errors.push(error);
    }

    expect(errors.some((error) => String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT"))).toBe(true);
    expect(container.textContent).not.toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });
});
