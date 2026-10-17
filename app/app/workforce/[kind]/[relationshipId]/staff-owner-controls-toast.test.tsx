// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profession: vi.fn(),
  suspend: vi.fn(),
  restore: vi.fn(),
  promote: vi.fn(),
  demote: vi.fn(),
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
  updateHospitalMembershipProfessionAction: mocks.profession,
  suspendHospitalMembershipAction: mocks.suspend,
  restoreHospitalMembershipAction: mocks.restore,
  promoteHospitalOwnerAction: mocks.promote,
  demoteHospitalOwnerAction: mocks.demote,
}));

import type {
  WorkforceMembershipMutationActionState,
  WorkforceOwnerGovernanceMutationActionState,
} from "@/modules/workforce/transport/action-state";
import {
  deferred,
  findButton,
  formOf,
  installDialogSupport,
  restoreDialogSupport,
  settle,
  submitForm,
  toastCalls,
} from "./controls-test-support";
import { StaffMembershipControls } from "./staff-membership-controls";

const RELATIONSHIP_ID = "relationship-private-1";
const OTHER_RELATIONSHIP_ID = "relationship-private-2";
const HOSPITAL_ID = "hospital-private-1";
const V1 = "2026-10-01T00:00:00.000Z";
const V2 = "2026-10-02T00:00:00.000Z";
const V3 = "2026-10-03T00:00:00.000Z";

type Props = Parameters<typeof StaffMembershipControls>[0];

const baseProps: Props = {
  accountStatus: "ACTIVE",
  actions: { updateProfession: true, suspend: true, restore: true, resetPassword: false },
  expectedUpdatedAt: V1,
  membershipType: "MEMBER",
  ownerGovernance: { canPromote: false, canDemote: false },
  profession: "NURSE",
  relationshipId: RELATIONSHIP_ID,
  relationshipStatus: "ACTIVE",
  targetHospitalId: HOSPITAL_ID,
};

let container: HTMLDivElement;
let root: Root;
let currentProps: Props;

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
  currentProps = baseProps;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Live regions (status, alert, aria-live) whose text includes `text`; a Toasted success must not be one of them. */
function liveRegionsContaining(root: ParentNode, text: string): Element[] {
  return Array.from(root.querySelectorAll('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')).filter(
    (element) => element.textContent?.includes(text),
  );
}

function render(overrides: Partial<Props> = {}): void {
  currentProps = { ...currentProps, ...overrides };
  act(() => root.render(createElement(StaffMembershipControls, currentProps)));
}

function membership(
  overrides: Partial<Extract<WorkforceMembershipMutationActionState, { status: "SUCCESS" }>["result"]> = {},
): WorkforceMembershipMutationActionState {
  return {
    status: "SUCCESS",
    result: {
      relationshipId: RELATIONSHIP_ID,
      hospitalId: HOSPITAL_ID,
      membershipStatus: "ACTIVE",
      profession: "NURSE",
      updatedAt: V2,
      ...overrides,
    },
  };
}

function refusal(code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"): WorkforceMembershipMutationActionState {
  return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
}

function ownerResult(membershipType: "OWNER" | "MEMBER"): WorkforceOwnerGovernanceMutationActionState {
  return {
    status: "SUCCESS",
    result: { relationshipId: RELATIONSHIP_ID, hospitalId: HOSPITAL_ID, membershipType, updatedAt: V2 },
  };
}

function ownerRefusal(code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"): WorkforceOwnerGovernanceMutationActionState {
  return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
}

function spies(): Parameters<typeof toastCalls>[0] {
  return mocks;
}

function noToast(): void {
  expect(toastCalls(spies())).toHaveLength(0);
}

const triggers = {
  profession: {
    action: mocks.profession,
    label: "บันทึกวิชาชีพ",
    run: (): void => act(() => submitForm(container, "บันทึกวิชาชีพ")),
    success: () => membership(),
    toast: "บันทึกวิชาชีพแล้ว",
  },
  suspend: {
    action: mocks.suspend,
    label: "ระงับความสัมพันธ์",
    run: (): void => {
      act(() => findButton(container, "ระงับความสัมพันธ์").click());
      const dialog = container.querySelector("dialog");
      if (!dialog) throw new Error("Missing confirmation dialog");
      act(() => findButton(dialog, "ระงับความสัมพันธ์").click());
    },
    success: () => membership({ membershipStatus: "SUSPENDED" }),
    toast: "ระงับสมาชิกโรงพยาบาลแล้ว",
  },
  restore: {
    action: mocks.restore,
    label: "คืนสถานะความสัมพันธ์",
    run: (): void => act(() => submitForm(container, "คืนสถานะความสัมพันธ์")),
    success: () => membership({ membershipStatus: "ACTIVE" }),
    toast: "คืนสถานะสมาชิกโรงพยาบาลแล้ว",
  },
} as const;

type TriggerName = keyof typeof triggers;
const names = Object.keys(triggers) as TriggerName[];

describe("Staff membership controls Toasts", () => {
  it.each(names)("%s: emits one success Toast only after confirmed success and refreshes once", async (name) => {
    const trigger = triggers[name];
    const pending = deferred<WorkforceMembershipMutationActionState>();
    trigger.action.mockReturnValueOnce(pending.promise);
    render();

    trigger.run();
    await act(async () => {
      await Promise.resolve();
    });
    expect(trigger.action).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(trigger.success());
      await pending.promise;
    });
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith(trigger.toast);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว");
    expect(liveRegionsContaining(container, "บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว")).toHaveLength(0);
    const formData = trigger.action.mock.calls[0]?.[1];
    expect(formData?.get("expectedUpdatedAt")).toBe(V1);
    expect(formData?.get("relationshipId")).toBe(RELATIONSHIP_ID);
  });

  it("keeps Toasts free of identifiers and versions", async () => {
    mocks.profession.mockResolvedValueOnce(membership());
    render();
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));

    const serialized = JSON.stringify(toastCalls(spies()));
    expect(serialized).not.toContain(RELATIONSHIP_ID);
    expect(serialized).not.toContain(HOSPITAL_ID);
    expect(serialized).not.toContain(V2);
  });

  it("does not submit or notify when the suspension confirmation is canceled", async () => {
    render();
    act(() => findButton(container, "ระงับความสัมพันธ์").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");

    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();

    expect(mocks.suspend).not.toHaveBeenCalled();
    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(names)("%s: maps confirmed refusals to Toasts, keeps text inline, and does not refresh", async (name) => {
    const trigger = triggers[name];
    for (const [code, level, message] of [
      ["CONFLICT", "warning", "สถานะสมาชิกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด"],
      ["FORBIDDEN", "error", "ไม่มีสิทธิ์จัดการสมาชิกโรงพยาบาลนี้"],
    ] as const) {
      for (const mock of Object.values(mocks)) mock.mockReset();
      trigger.action.mockResolvedValueOnce(refusal(code));
      act(() => root.unmount());
      root = createRoot(container);
      render();

      trigger.run();
      await settle();

      expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
      expect(mocks.success).not.toHaveBeenCalled();
      expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  });

  it.each(names)("%s: keeps validation errors inline with no Toast", async (name) => {
    const trigger = triggers[name];
    trigger.action.mockResolvedValueOnce(refusal("INVALID_INPUT"));
    render();

    trigger.run();
    await settle();

    noToast();
    expect(container.textContent).toContain("ผลลัพธ์ INVALID_INPUT จากระบบ");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(names)("%s: treats returned UNAVAILABLE as unknown, locks the controls and never retries", async (name) => {
    const trigger = triggers[name];
    trigger.action.mockResolvedValueOnce(refusal("UNAVAILABLE"));
    render();

    trigger.run();
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("ผลลัพธ์ UNAVAILABLE จากระบบ");
    for (const other of names) {
      expect(findButton(container, triggers[other].label).disabled).toBe(true);
    }
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    expect(trigger.action).toHaveBeenCalledOnce();
  });

  it.each(names)("%s: treats a thrown request as unknown with no Toast and no retry", async (name) => {
    const trigger = triggers[name];
    trigger.action.mockRejectedValueOnce(new TypeError("private server failure"));
    render();

    trigger.run();
    await settle();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    expect(trigger.action).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not treat a success for a different profession as confirmation", async () => {
    mocks.profession.mockResolvedValueOnce(membership({ profession: "DOCTOR" }));
    render();

    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("does not treat a suspend result that left the membership active as confirmation", async () => {
    mocks.suspend.mockResolvedValueOnce(membership({ membershipStatus: "ACTIVE" }));
    render();

    triggers.suspend.run();
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("drops a rapid duplicate submission before it reaches the Server Action", async () => {
    const pending = deferred<WorkforceMembershipMutationActionState>();
    mocks.profession.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      submitForm(container, "บันทึกวิชาชีพ");
      submitForm(container, "บันทึกวิชาชีพ");
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(membership());
      await pending.promise;
    });
    await settle();

    expect(mocks.profession).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("blocks a different mutation while another is in flight", async () => {
    const pending = deferred<WorkforceMembershipMutationActionState>();
    mocks.profession.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      submitForm(container, "บันทึกวิชาชีพ");
      await Promise.resolve();
    });
    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์"));
    await act(async () => {
      pending.resolve(membership());
      await pending.promise;
    });

    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.profession).toHaveBeenCalledOnce();
  });

  it("holds the controls until the refreshed version arrives, then accepts the next mutation", async () => {
    mocks.profession.mockResolvedValueOnce(membership());
    render();
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    await settle();
    expect(findButton(container, "คืนสถานะความสัมพันธ์").disabled).toBe(true);

    render({ expectedUpdatedAt: V2 });

    expect(findButton(container, "คืนสถานะความสัมพันธ์").disabled).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not replay the Toast or refresh on rerender", async () => {
    mocks.profession.mockResolvedValueOnce(membership());
    render();
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    await settle();

    render({ expectedUpdatedAt: V2 });
    render({ expectedUpdatedAt: V2 });

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("Suspend SUCCESS then Restore UNAVAILABLE: only the later outcome drives feedback and no second refresh", async () => {
    mocks.suspend.mockResolvedValueOnce(membership({ membershipStatus: "SUSPENDED" }));
    render();
    triggers.suspend.run();
    await settle();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ระงับสมาชิกโรงพยาบาลแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    render({ expectedUpdatedAt: V2, relationshipStatus: "SUSPENDED" });
    mocks.restore.mockResolvedValueOnce(refusal("UNAVAILABLE"));
    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์"));
    await settle();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว");
  });

  it("Profession SUCCESS then Suspend CONFLICT: the old success neither refreshes nor displays again", async () => {
    mocks.profession.mockResolvedValueOnce(membership());
    render();
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    await settle();
    render({ expectedUpdatedAt: V2 });

    mocks.suspend.mockResolvedValueOnce(refusal("CONFLICT"));
    triggers.suspend.run();
    await settle();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("สถานะสมาชิกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ผลลัพธ์ CONFLICT จากระบบ");
    expect(container.textContent).not.toContain("บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว");
  });

  it("earlier error does not appear after a later success", async () => {
    mocks.profession.mockResolvedValueOnce(refusal("CONFLICT"));
    render();
    await act(async () => submitForm(container, "บันทึกวิชาชีพ"));
    await settle();
    expect(container.textContent).toContain("ผลลัพธ์ CONFLICT จากระบบ");

    mocks.restore.mockResolvedValueOnce(membership({ membershipStatus: "ACTIVE" }));
    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์"));
    await settle();

    expect(container.textContent).not.toContain("ผลลัพธ์ CONFLICT จากระบบ");
    expect(container.textContent).toContain("บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows no Toast, refresh or feedback in relationship B for a request submitted from relationship A", async () => {
    const pending = deferred<WorkforceMembershipMutationActionState>();
    mocks.profession.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      submitForm(container, "บันทึกวิชาชีพ");
      await Promise.resolve();
    });

    render({ relationshipId: OTHER_RELATIONSHIP_ID, expectedUpdatedAt: V3 });
    await act(async () => {
      pending.resolve(membership());
      await pending.promise;
    });
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว");
  });

  it("shows no Toast or refresh for a response that arrives after unmount", async () => {
    const pending = deferred<WorkforceMembershipMutationActionState>();
    mocks.profession.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      submitForm(container, "บันทึกวิชาชีพ");
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      pending.resolve(membership());
      await pending.promise;
    });

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it("keeps form fields other than the submitted ones unchanged and never disables the account", () => {
    render();
    expect(formOf(container, "บันทึกวิชาชีพ").querySelector('input[name="targetHospitalId"]')).toBeTruthy();
  });
});

describe("Hospital owner governance controls Toasts", () => {
  const ownerProps: Partial<Props> = {
    ownerGovernance: { canPromote: true, canDemote: true },
    actions: { updateProfession: false, suspend: false, restore: false, resetPassword: false },
  };

  function demote(): void {
    act(() => findButton(container, "เปลี่ยนเป็นสมาชิก").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing demotion dialog");
    act(() => findButton(dialog, "เปลี่ยนเป็นสมาชิก").click());
  }

  it("promotes with one Toast after confirmed OWNER result and refreshes once", async () => {
    mocks.promote.mockResolvedValueOnce(ownerResult("OWNER"));
    render(ownerProps);

    await act(async () => submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล"));
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("กำหนดสิทธิ์เจ้าของโรงพยาบาลแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("บันทึกบทบาทเจ้าของโรงพยาบาลเรียบร้อยแล้ว");
    expect(mocks.promote.mock.calls[0]?.[1]?.get("expectedUpdatedAt")).toBe(V1);
  });

  it("requires demotion confirmation and announces only a confirmed MEMBER result", async () => {
    mocks.demote.mockResolvedValueOnce(ownerResult("MEMBER"));
    render(ownerProps);
    act(() => findButton(container, "เปลี่ยนเป็นสมาชิก").click());
    expect(mocks.demote).not.toHaveBeenCalled();
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing demotion dialog");
    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();
    expect(mocks.demote).not.toHaveBeenCalled();
    noToast();

    demote();
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("เปลี่ยนสิทธิ์เจ้าของโรงพยาบาลแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not treat a promote result that is still MEMBER as confirmation", async () => {
    mocks.promote.mockResolvedValueOnce(ownerResult("MEMBER"));
    render(ownerProps);

    await act(async () => submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล"));
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("Promote SUCCESS then Demote FORBIDDEN: warns with the later error only and refreshes once", async () => {
    mocks.promote.mockResolvedValueOnce(ownerResult("OWNER"));
    render(ownerProps);
    await act(async () => submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล"));
    await settle();
    render({ ...ownerProps, expectedUpdatedAt: V2 });

    mocks.demote.mockResolvedValueOnce(ownerRefusal("FORBIDDEN"));
    demote();
    await settle();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์จัดการสิทธิ์เจ้าของโรงพยาบาล");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ผลลัพธ์ FORBIDDEN จากระบบ");
    expect(container.textContent).not.toContain("บันทึกบทบาทเจ้าของโรงพยาบาลเรียบร้อยแล้ว");
  });

  it("keeps the last-owner conflict as a warning plus the server's inline explanation", async () => {
    mocks.demote.mockResolvedValueOnce(ownerRefusal("CONFLICT"));
    render(ownerProps);

    demote();
    await settle();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("สิทธิ์เจ้าของเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
    expect(container.textContent).toContain("ผลลัพธ์ CONFLICT จากระบบ");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.promote.mockResolvedValueOnce(ownerRefusal("INVALID_INPUT"));
    render(ownerProps);

    await act(async () => submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล"));
    await settle();

    noToast();
    expect(container.textContent).toContain("ผลลัพธ์ INVALID_INPUT จากระบบ");
  });

  it.each(["returned", "thrown"] as const)("treats a %s uncertain demotion as unknown and never retries", async (mode) => {
    if (mode === "returned") mocks.demote.mockResolvedValueOnce(ownerRefusal("UNAVAILABLE"));
    else mocks.demote.mockRejectedValueOnce(new TypeError("private server failure"));
    render(ownerProps);

    demote();
    await settle();

    noToast();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    expect(findButton(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล").disabled).toBe(true);
    await act(async () => submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล"));
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.demote).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("drops a rapid duplicate promotion", async () => {
    const pending = deferred<WorkforceOwnerGovernanceMutationActionState>();
    mocks.promote.mockReturnValueOnce(pending.promise);
    render(ownerProps);

    await act(async () => {
      submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล");
      submitForm(container, "เปลี่ยนเป็นเจ้าของโรงพยาบาล");
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(ownerResult("OWNER"));
      await pending.promise;
    });
    await settle();

    expect(mocks.promote).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });
});
