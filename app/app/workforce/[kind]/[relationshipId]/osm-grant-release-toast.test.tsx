// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  osmSuspend: vi.fn(),
  osmRestore: vi.fn(),
  release: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info },
}));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  suspendOsmRelationshipAction: mocks.osmSuspend,
  restoreOsmRelationshipAction: mocks.osmRestore,
}));
vi.mock("@/modules/workforce/transport/workforce-release-action", () => ({
  releaseWorkforceAction: mocks.release,
}));

import type {
  WorkforceOsmRelationshipMutationActionState,
  WorkforceReleaseActionState,
} from "@/modules/workforce/transport/action-state";
import {
  deferred,
  findButton,
  installDialogSupport,
  restoreDialogSupport,
  settle,
  submitForm,
  toastCalls,
} from "./controls-test-support";
import { OsmRelationshipControls } from "./osm-relationship-controls";
import { WorkforceReleaseControl } from "./workforce-release-control";

const RELATIONSHIP_ID = "relationship-private-1";
const OTHER_RELATIONSHIP_ID = "relationship-private-2";
const HOSPITAL_ID = "hospital-private-1";
const V1 = "2026-10-01T00:00:00.000Z";
const V2 = "2026-10-02T00:00:00.000Z";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogSupport();
});

afterAll(() => restoreDialogSupport());

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function noToast(): void {
  expect(toastCalls(mocks)).toHaveLength(0);
}

describe("OSM relationship controls Toasts", () => {
  type Props = Parameters<typeof OsmRelationshipControls>[0];
  const defaults: Props = {
    accountStatus: "ACTIVE",
    actions: { updateProfession: false, suspend: true, restore: true, resetPassword: false },
    currentAssignmentCount: 0,
    expectedUpdatedAt: V1,
    lifecycleBlockReason: null,
    relationshipId: RELATIONSHIP_ID,
    relationshipStatus: "ACTIVE",
    targetHospitalId: HOSPITAL_ID,
  };
  let props: Props = defaults;

  function render(overrides: Partial<Props> = {}): void {
    props = { ...props, ...overrides };
    act(() => root.render(createElement(OsmRelationshipControls, props)));
  }

  beforeEach(() => {
    props = defaults;
  });

  function osm(status: "ACTIVE" | "SUSPENDED"): WorkforceOsmRelationshipMutationActionState {
    return {
      status: "SUCCESS",
      result: { relationshipId: RELATIONSHIP_ID, hospitalId: HOSPITAL_ID, relationshipStatus: status, updatedAt: V2 },
    };
  }

  function osmRefusal(code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"): WorkforceOsmRelationshipMutationActionState {
    return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
  }

  function suspendWithConfirmation(): void {
    act(() => findButton(container, "พักสิทธิ์ อสม. ในโรงพยาบาลนี้").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");
    act(() => findButton(dialog, "พักสิทธิ์ อสม. ชั่วคราว").click());
  }

  it("requires confirmation before suspending and notifies only after a confirmed SUSPENDED result", async () => {
    mocks.osmSuspend.mockResolvedValueOnce(osm("SUSPENDED"));
    render();
    act(() => findButton(container, "พักสิทธิ์ อสม. ในโรงพยาบาลนี้").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");
    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();
    expect(mocks.osmSuspend).not.toHaveBeenCalled();
    noToast();

    suspendWithConfirmation();
    await settle();

    expect(mocks.osmSuspend).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราวแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราวแล้ว");
    expect(mocks.osmSuspend.mock.calls[0]?.[1]?.get("expectedUpdatedAt")).toBe(V1);
  });

  it("shows the current assignment count and blocks suspension while patients remain assigned", () => {
    render({ currentAssignmentCount: 2, actions: { updateProfession: false, suspend: false, restore: false, resetPassword: false } });

    expect(container.textContent).toContain("อสม. รายนี้ยังรับผิดชอบผู้ป่วย 2 ราย");
    expect(container.textContent).toContain("กรุณาเปลี่ยนผู้รับผิดชอบผู้ป่วยก่อนพักสิทธิ์ อสม. ชั่วคราว");
    expect(container.querySelector("button")).toBeNull();
    expect(mocks.osmSuspend).not.toHaveBeenCalled();
    expect(mocks.osmRestore).not.toHaveBeenCalled();
  });

  it("restores with one Toast and refreshes once", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osm("ACTIVE"));
    render();

    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้งแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not treat a restore that returned SUSPENDED as confirmation", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osm("SUSPENDED"));
    render();

    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it.each([
    ["CONFLICT", "warning", "สิทธิ์การทำงานของ อสม. เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์จัดการสิทธิ์การทำงานของ อสม. รายนี้"],
  ] as const)("maps a confirmed %s to a %s Toast and keeps the server text inline", async (code, level, message) => {
    mocks.osmRestore.mockResolvedValueOnce(osmRefusal(code));
    render();

    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    await settle();

    expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osmRefusal("INVALID_INPUT"));
    render();

    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    await settle();

    noToast();
    expect(container.textContent).toContain("ผลลัพธ์ INVALID_INPUT จากระบบ");
  });

  it.each(["returned", "thrown"] as const)("treats a %s uncertain suspension as unknown and never retries", async (mode) => {
    if (mode === "returned") mocks.osmSuspend.mockResolvedValueOnce(osmRefusal("UNAVAILABLE"));
    else mocks.osmSuspend.mockRejectedValueOnce(new TypeError("private server failure"));
    render();

    suspendWithConfirmation();
    await settle();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    expect(findButton(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง").disabled).toBe(true);
    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    expect(mocks.osmRestore).not.toHaveBeenCalled();
    expect(mocks.osmSuspend).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("Suspend SUCCESS then Restore UNAVAILABLE: no second refresh and the success text is replaced", async () => {
    mocks.osmSuspend.mockResolvedValueOnce(osm("SUSPENDED"));
    render();
    suspendWithConfirmation();
    await settle();
    render({ expectedUpdatedAt: V2, relationshipStatus: "SUSPENDED" });

    mocks.osmRestore.mockResolvedValueOnce(osmRefusal("UNAVAILABLE"));
    await act(async () => submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"));
    await settle();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราวแล้ว");
  });

  it("drops a rapid duplicate restore", async () => {
    const pending = deferred<WorkforceOsmRelationshipMutationActionState>();
    mocks.osmRestore.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง");
      submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง");
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(osm("ACTIVE"));
      await pending.promise;
    });
    await settle();

    expect(mocks.osmRestore).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("gives another relationship no Toast, refresh or feedback from a pending request", async () => {
    const pending = deferred<WorkforceOsmRelationshipMutationActionState>();
    mocks.osmRestore.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      submitForm(container, "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง");
      await Promise.resolve();
    });

    render({ relationshipId: OTHER_RELATIONSHIP_ID });
    await act(async () => {
      pending.resolve(osm("ACTIVE"));
      await pending.promise;
    });
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("เรียบร้อยแล้ว");
  });
});

describe("Workforce release control Toasts", () => {
  let renderedKind: "osm" | "staff" = "osm";

  function releaseTriggerLabel(): string {
    return renderedKind === "osm" ? "นำอสม.ออกจากโรงพยาบาลนี้อย่างถาวร" : "นำเจ้าหน้าที่ออกจากโรงพยาบาลนี้อย่างถาวร";
  }

  function render(relationshipId = RELATIONSHIP_ID, kind: "osm" | "staff" = "osm"): void {
    renderedKind = kind;
    act(() =>
      root.render(
        createElement(WorkforceReleaseControl, {
          relationshipId,
          hospitalId: HOSPITAL_ID,
          kind,
          updatedAt: V1,
          resourceName: kind === "osm" ? "อสม. สมพร" : "สมพร ใจดี",
          hospitalName: "โรงพยาบาลชุมชน",
        }),
      ),
    );
  }

  const released: WorkforceReleaseActionState = {
    success: true,
    outcome: "RELEASED",
    message: "สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว ประวัติยังคงอยู่",
  };

  function release(outcome: WorkforceReleaseActionState["outcome"], success = false): WorkforceReleaseActionState {
    return { success, outcome, message: `ผลลัพธ์ ${String(outcome)} จากระบบ` };
  }

  function confirmationInput(): HTMLInputElement {
    const dialog = openReleaseDialog();
    const input = dialog?.querySelector<HTMLInputElement>("#release-confirmation");
    if (!input) throw new Error("Missing confirmation input");
    return input;
  }

  function openReleaseDialog(): HTMLDialogElement | null {
    let dialog = container.querySelector("dialog");
    if (dialog) return dialog;
    const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === releaseTriggerLabel());
    if (!trigger || trigger.disabled) return null;
    flushSync(() => trigger.click());
    dialog = container.querySelector("dialog");
    return dialog;
  }

  async function submitRelease(): Promise<void> {
    const dialog = openReleaseDialog();
    if (!dialog) return;
    await act(async () => submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร"));
    await settle();
  }

  it("opens a focused destructive dialog and cancel returns focus without mutation", () => {
    render();
    const trigger = findButton(container, "นำอสม.ออกจากโรงพยาบาลนี้อย่างถาวร");
    act(() => trigger.click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing workforce release dialog");

    expect(dialog.textContent).toContain("อสม. สมพร");
    expect(dialog.textContent).toContain("โรงพยาบาลชุมชน");
    expect(dialog.textContent).toContain("เปิดสิทธิ์เดิมกลับไม่ได้");
    expect(dialog.textContent).toContain("ประวัติการทำงานยังคงอยู่");
    expect(dialog.textContent).toContain("สิทธิ์ที่มีอยู่ในโรงพยาบาลอื่นจะคงเดิม");
    expect(dialog.textContent).toContain("ลิงก์เปิดใช้งานที่ยังไม่ได้ใช้ของบัญชีนี้ในทุกโรงพยาบาลจะถูกเพิกถอน");
    expect(dialog.querySelectorAll("form")).toHaveLength(1);
    expect(document.activeElement).toBe(findButton(dialog, "ยกเลิก"));
    expect(mocks.release).not.toHaveBeenCalled();

    act(() => findButton(dialog, "ยกเลิก").click());

    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("announces a confirmed release once, closes into a terminal status, and issues no client refresh", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();
    const dialog = openReleaseDialog();
    if (!dialog) throw new Error("Missing workforce release dialog");

    await act(async () => {
      submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร");
      await Promise.resolve();
    });
    expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว");
    expect(container.textContent).toContain("สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว ประวัติยังคงอยู่");
    expect(container.querySelector("dialog")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.trim() === releaseTriggerLabel())).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    const formData = mocks.release.mock.calls[0]?.[1];
    expect(formData?.get("expectedUpdatedAt")).toBe(V1);
    expect(formData?.get("kind")).toBe("osm");
  });

  it("does not replay the Toast after a rerender and refuses a second release", async () => {
    mocks.release.mockResolvedValueOnce(released);
    render();
    await submitRelease();

    render();
    await submitRelease();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it.each(["osm", "staff"] as const)("uses cause-neutral conflict wording for %s release", async (kind) => {
    const conflictMessage = "ไม่สามารถดำเนินการได้ ข้อมูลอาจเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่";
    mocks.release.mockResolvedValueOnce({ success: false, outcome: "CONFLICT", message: conflictMessage });
    render(RELATIONSHIP_ID, kind);

    await submitRelease();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith(conflictMessage);
    expect(container.textContent).toContain(conflictMessage);
    expect(container.textContent).not.toContain("แอดมินอย่างน้อยหนึ่งคน");
    expect(findButton(container, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร").disabled).toBe(false);
  });

  it("maps a confirmed authorization refusal to an error Toast", async () => {
    mocks.release.mockResolvedValueOnce(release("FORBIDDEN"));
    render();

    await submitRelease();

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์สิ้นสุดสิทธิ์การทำงานกับโรงพยาบาลนี้");
    expect(container.textContent).toContain("ผลลัพธ์ FORBIDDEN จากระบบ");
    expect(findButton(container, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร").disabled).toBe(false);
  });

  it("keeps a wrong confirmation phrase inline, preserves the typed text, and allows a corrected submission", async () => {
    mocks.release.mockResolvedValueOnce(release("INVALID_CONFIRMATION"));
    render();
    await act(async () => {
      confirmationInput().value = "ผิด";
    });

    await submitRelease();

    noToast();
    expect(container.textContent).toContain("ผลลัพธ์ INVALID_CONFIRMATION จากระบบ");
    expect(confirmationInput().value).toBe("ผิด");

    mocks.release.mockResolvedValueOnce(released);
    await submitRelease();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("never reads a bare failure as a conflict or refusal and treats UNAVAILABLE as unknown", async () => {
    mocks.release.mockResolvedValueOnce(release("UNAVAILABLE"));
    render();

    await submitRelease();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    expect(findButton(container, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร").disabled).toBe(true);
    await submitRelease();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("treats a result without an outcome as unconfirmed", async () => {
    mocks.release.mockResolvedValueOnce({ success: false, outcome: null, message: "ข้อความทั่วไป" });
    render();

    await submitRelease();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("ข้อความทั่วไป");
  });

  it("does not trust a RELEASED outcome that is not marked successful", async () => {
    mocks.release.mockResolvedValueOnce({ success: false, outcome: "RELEASED", message: "ข้อความขัดแย้ง" });
    render();

    await submitRelease();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("treats a thrown release as unknown with no Toast and no retry", async () => {
    mocks.release.mockRejectedValueOnce(new TypeError("private server failure"));
    render();

    await submitRelease();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    await submitRelease();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("drops a rapid duplicate release before it reaches the Server Action", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      const dialog = openReleaseDialog();
      if (!dialog) throw new Error("Missing workforce release dialog");
      submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร");
      submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร");
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });
    await settle();

    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("gives another relationship no Toast or inline result from a pending release", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();
    const dialog = openReleaseDialog();
    if (!dialog) throw new Error("Missing workforce release dialog");
    await act(async () => {
      submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร");
      await Promise.resolve();
    });

    render(OTHER_RELATIONSHIP_ID);
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });
    await settle();

    noToast();
    expect(container.textContent).not.toContain("สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว ประวัติยังคงอยู่");
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();
    const dialog = openReleaseDialog();
    if (!dialog) throw new Error("Missing workforce release dialog");
    await act(async () => {
      submitForm(dialog, "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร");
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });

    noToast();
    root = createRoot(container);
  });

  it("keeps Toasts free of identifiers and confirmation text", async () => {
    mocks.release.mockResolvedValueOnce(released);
    render();
    await act(async () => {
      const input = confirmationInput();
      input.value = "นำออกจากโรงพยาบาลนี้อย่างถาวร";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submitRelease();

    const serialized = JSON.stringify(toastCalls(mocks));
    expect(serialized).not.toContain(RELATIONSHIP_ID);
    expect(serialized).not.toContain(HOSPITAL_ID);
    expect(serialized).not.toContain("นำออกจากโรงพยาบาลนี้อย่างถาวร\"");
  });
});
