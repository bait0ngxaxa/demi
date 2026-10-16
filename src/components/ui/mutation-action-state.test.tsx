// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { submitPreservingInput, useMutationActionState } from "./mutation-action-state";
import { UnknownOutcomeAlert, type UnknownOutcomeRecovery } from "./unknown-outcome-alert";

type State = { status: "IDLE" | "SUCCESS" | "ERROR"; message: string };
type Runner = (formData: FormData) => Promise<State>;

function Harness({ run, nonce = "nonce-1" }: { run: Runner; nonce?: string }): React.JSX.Element {
  const [state, dispatch, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<State, FormData>(
    async (_previous, formData) => run(formData),
    { status: "IDLE", message: "" },
  );

  return createElement(
    "form",
    { action: dispatch, onSubmit: submitPreservingInput(dispatch) },
    createElement("input", { name: "submissionNonce", type: "hidden", value: nonce }),
    createElement("input", { "data-testid": "note", name: "note" }),
    createElement(
      "button",
      { "data-testid": "submit", disabled: pending || unknownOutcome, name: "intent", type: "submit", value: "save" },
      "บันทึก",
    ),
    createElement("p", { "data-testid": "status" }, state.status),
    createElement(UnknownOutcomeAlert, {
      active: unknownOutcome,
      recovery: { kind: "resend", onResend: resendUnconfirmed, resending: pending },
    }),
  );
}

/** Server double that deduplicates by submission nonce, like the Screening/Appointment services. */
function nonceStore(): { records: Map<string, string>; run: Runner; loseNextResponse: () => void } {
  const records = new Map<string, string>();
  let loseResponse = false;
  return {
    records,
    loseNextResponse: () => {
      loseResponse = true;
    },
    run: vi.fn<Runner>(async (formData) => {
      const nonce = String(formData.get("submissionNonce"));
      const note = String(formData.get("note"));
      const existing = records.get(nonce);
      if (existing !== undefined && existing !== note) {
        return { status: "ERROR", message: "รหัสคำขอนี้ถูกใช้แล้ว" };
      }
      records.set(nonce, note);
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Failed to fetch");
      }
      return { status: "SUCCESS", message: existing === undefined ? "CREATED" : "REPLAYED" };
    }),
  };
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

function mount(run: Runner, nonce?: string): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { run, nonce })));
}

const query = <T extends Element>(selector: string): T => container.querySelector<T>(selector)!;

async function submit(value: string): Promise<void> {
  query<HTMLInputElement>("[data-testid=note]").value = value;
  await act(async () => {
    query<HTMLButtonElement>("[data-testid=submit]").click();
  });
}

async function clickResend(): Promise<void> {
  await act(async () => {
    query<HTMLButtonElement>('[role="alert"] button').click();
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

  it("verifies a request that committed before its response was lost by resending the same identity, without a duplicate", async () => {
    const server = nonceStore();
    mount(server.run);
    server.loseNextResponse();

    await submit("ผลประเมินรอบแรก");
    expect(server.records.size).toBe(1);
    expect(query("[data-testid=status]").textContent).toBe("IDLE");

    // Nothing is resent until the user asks.
    expect(server.run).toHaveBeenCalledTimes(1);

    await clickResend();

    expect(server.run).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(server.run).mock.calls.map(([formData]) => formData);
    expect(second?.get("submissionNonce")).toBe(first?.get("submissionNonce"));
    expect(second?.get("note")).toBe("ผลประเมินรอบแรก");
    expect(server.records.size).toBe(1);
    expect(query("[data-testid=status]").textContent).toBe("SUCCESS");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("resends the original payload even if the field was changed while the outcome was unknown", async () => {
    const server = nonceStore();
    mount(server.run);
    server.loseNextResponse();
    await submit("ค่าเดิม");

    query<HTMLInputElement>("[data-testid=note]").value = "ค่าที่แก้ภายหลัง";
    await clickResend();

    expect(vi.mocked(server.run).mock.calls[1]?.[0].get("note")).toBe("ค่าเดิม");
    expect(server.records.get("nonce-1")).toBe("ค่าเดิม");
    expect(query("[data-testid=status]").textContent).toBe("SUCCESS");
  });

  it("warns before a reload would discard the unconfirmed identity, and stops warning once confirmed", async () => {
    const server = nonceStore();
    mount(server.run);
    server.loseNextResponse();
    await submit("รอยืนยัน");

    const whileUnknown = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(whileUnknown);
    expect(whileUnknown.defaultPrevented).toBe(true);

    await clickResend();

    const afterConfirmation = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterConfirmation);
    expect(afterConfirmation.defaultPrevented).toBe(false);
  });

  it("treats a reloaded page as a new request identity, which is why reload is not offered as verification", async () => {
    const server = nonceStore();
    mount(server.run, "nonce-before-reload");
    server.loseNextResponse();
    await submit("นัดหมายเดียวกัน");
    act(() => root.unmount());
    container.remove();

    // A server render issues a fresh nonce; submitting again is a new request.
    mount(server.run, "nonce-after-reload");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await submit("นัดหมายเดียวกัน");

    expect(server.records.size).toBe(2);
  });

  it("allows a new submission after a resend confirms the earlier one", async () => {
    const server = nonceStore();
    mount(server.run);
    server.loseNextResponse();
    await submit("ครั้งแรก");
    await clickResend();

    expect(query<HTMLButtonElement>("[data-testid=submit]").disabled).toBe(false);
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

describe("UnknownOutcomeAlert recovery contracts", () => {
  function renderAlert(recovery: UnknownOutcomeRecovery): void {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(UnknownOutcomeAlert, { active: true, recovery })));
  }

  it("offers a reload that reads current state for updates without warning on unload", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderAlert({ kind: "reload" });

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    expect(query('[role="alert"]').textContent).toContain("โหลดข้อมูลล่าสุด");
    act(() => query<HTMLButtonElement>('[role="alert"] button').click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("supports specific recovery guidance while reloading current state instead of replaying", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderAlert({
      kind: "reload",
      label: "ตรวจสอบสถานะล่าสุด",
      message: "ลิงก์เดิมแสดงซ้ำไม่ได้ ตรวจสอบสถานะก่อนออกลิงก์ใหม่",
    });

    expect(query('[role="alert"]').textContent).toContain("ลิงก์เดิมแสดงซ้ำไม่ได้");
    expect(query('[role="alert"] button').textContent).toBe("ตรวจสอบสถานะล่าสุด");
    act(() => query<HTMLButtonElement>('[role="alert"] button').click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("states the duplicate risk for creates without server deduplication", () => {
    renderAlert({ kind: "review", label: "ตรวจสอบรายการคำขอล่าสุด" });

    expect(query('[role="alert"]').textContent).toContain("อาจถูกบันทึกซ้ำหากส่งอีกครั้ง");
    expect(query('[role="alert"] button').textContent).toBe("ตรวจสอบรายการคำขอล่าสุด");
  });

  it("shows the workflow note when no in-page verification exists", () => {
    renderAlert({ kind: "note", note: "ออกจากระบบแล้วเข้าสู่ระบบด้วยรหัสผ่านใหม่เพื่อตรวจสอบ" });

    expect(query('[role="alert"]').textContent).toContain("ออกจากระบบแล้วเข้าสู่ระบบด้วยรหัสผ่านใหม่เพื่อตรวจสอบ");
    expect(container.querySelector("button")).toBeNull();
  });
});
