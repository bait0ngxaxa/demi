// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  osmSuspend: vi.fn(),
  osmRestore: vi.fn(),
  grant: vi.fn(),
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
  setHospitalMembershipReportExportGrantAction: mocks.grant,
  setHospitalMembershipNetworkPatientReadGrantAction: mocks.grant,
}));
vi.mock("@/modules/workforce/transport/workforce-release-action", () => ({
  releaseWorkforceAction: mocks.release,
}));

import type {
  WorkforceOsmRelationshipMutationActionState,
  WorkforceReleaseActionState,
  WorkforceReportExportGrantActionState,
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
import { ReportExportGrantControl } from "./report-export-grant-control";
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
    act(() => findButton(container, "ระงับความสัมพันธ์ อสม.").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");
    act(() => findButton(dialog, "ระงับความสัมพันธ์").click());
  }

  it("requires confirmation before suspending and notifies only after a confirmed SUSPENDED result", async () => {
    mocks.osmSuspend.mockResolvedValueOnce(osm("SUSPENDED"));
    render();
    act(() => findButton(container, "ระงับความสัมพันธ์ อสม.").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");
    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();
    expect(mocks.osmSuspend).not.toHaveBeenCalled();
    noToast();

    suspendWithConfirmation();
    await settle();

    expect(mocks.osmSuspend).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ระงับความสัมพันธ์ อสม. แล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("บันทึกการเปลี่ยนแปลงความสัมพันธ์ อสม. เรียบร้อยแล้ว");
    expect(mocks.osmSuspend.mock.calls[0]?.[1]?.get("expectedUpdatedAt")).toBe(V1);
  });

  it("restores with one Toast and refreshes once", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osm("ACTIVE"));
    render();

    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("คืนสถานะความสัมพันธ์ อสม. แล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not treat a restore that returned SUSPENDED as confirmation", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osm("SUSPENDED"));
    render();

    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it.each([
    ["CONFLICT", "warning", "ไม่สามารถเปลี่ยนความสัมพันธ์ อสม. ได้ กรุณาตรวจสอบสถานะล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์จัดการความสัมพันธ์ อสม. นี้"],
  ] as const)("maps a confirmed %s to a %s Toast and keeps the server text inline", async (code, level, message) => {
    mocks.osmRestore.mockResolvedValueOnce(osmRefusal(code));
    render();

    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
    await settle();

    expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.osmRestore.mockResolvedValueOnce(osmRefusal("INVALID_INPUT"));
    render();

    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
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
    expect(findButton(container, "คืนสถานะความสัมพันธ์ อสม.").disabled).toBe(true);
    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
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
    await act(async () => submitForm(container, "คืนสถานะความสัมพันธ์ อสม."));
    await settle();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("บันทึกการเปลี่ยนแปลงความสัมพันธ์ อสม. เรียบร้อยแล้ว");
  });

  it("drops a rapid duplicate restore", async () => {
    const pending = deferred<WorkforceOsmRelationshipMutationActionState>();
    mocks.osmRestore.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      submitForm(container, "คืนสถานะความสัมพันธ์ อสม.");
      submitForm(container, "คืนสถานะความสัมพันธ์ อสม.");
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
      submitForm(container, "คืนสถานะความสัมพันธ์ อสม.");
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

describe("Report export grant control Toasts", () => {
  type Props = Parameters<typeof ReportExportGrantControl>[0];

  function render(granted: boolean, relationshipId = RELATIONSHIP_ID): void {
    act(() =>
      root.render(
        createElement(ReportExportGrantControl, {
          expectedUpdatedAt: V1,
          grant: { granted, canGrant: true, canRevoke: true },
          relationshipId,
          targetHospitalId: HOSPITAL_ID,
        } satisfies Props),
      ),
    );
  }

  function grantState(granted: boolean): WorkforceReportExportGrantActionState {
    return { status: "SUCCESS", granted };
  }

  function grantRefusal(code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"): WorkforceReportExportGrantActionState {
    return { status: "ERROR", code, message: `ผลลัพธ์ ${code} จากระบบ` };
  }

  it("announces a confirmed grant once, refreshes once, and keeps the badge authoritative", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(true));
    render(false);

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ให้สิทธิ์ส่งออกรายงานแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ยังไม่ได้รับสิทธิ์");
    expect(mocks.grant.mock.calls[0]?.[1]?.get("granted")).toBe("true");

    render(true);
    expect(container.textContent).toContain("ส่งออกได้");
  });

  it("announces a confirmed revocation", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(false));
    render(true);

    await act(async () => submitForm(container, "ยกเลิกสิทธิ์ส่งออกรายงาน"));
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ยกเลิกสิทธิ์ส่งออกรายงานแล้ว");
    expect(mocks.grant.mock.calls[0]?.[1]?.get("granted")).toBe("false");
  });

  it("does not show success when the returned grant state is the opposite of what was requested", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(false));
    render(false);

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it.each([
    ["CONFLICT", "warning", "สถานะสิทธิ์ส่งออกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์จัดการสิทธิ์ส่งออกรายงาน"],
  ] as const)("maps a confirmed %s to a %s Toast and keeps the server text inline", async (code, level, message) => {
    mocks.grant.mockResolvedValueOnce(grantRefusal(code));
    render(false);

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
    expect(container.textContent).toContain(`ผลลัพธ์ ${code} จากระบบ`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.grant.mockResolvedValueOnce(grantRefusal("INVALID_INPUT"));
    render(false);

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    noToast();
    expect(container.textContent).toContain("ผลลัพธ์ INVALID_INPUT จากระบบ");
  });

  it("Grant SUCCESS then Revoke UNAVAILABLE: later unknown outcome wins with no second refresh", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(true));
    render(false);
    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();
    render(true);

    mocks.grant.mockResolvedValueOnce(grantRefusal("UNAVAILABLE"));
    await act(async () => submitForm(container, "ยกเลิกสิทธิ์ส่งออกรายงาน"));
    await settle();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.textContent).not.toContain("ให้สิทธิ์ส่งออกรายงานแล้ว");
    expect(findButton(container, "ยกเลิกสิทธิ์ส่งออกรายงาน").disabled).toBe(true);
  });

  it("treats a thrown request as unknown and never retries", async () => {
    mocks.grant.mockRejectedValueOnce(new TypeError("private server failure"));
    render(false);

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    noToast();
    expect(container.textContent).not.toContain("private server failure");
    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    expect(mocks.grant).toHaveBeenCalledOnce();
  });

  it("holds the form until the refreshed badge reflects the result", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(true));
    render(false);
    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();
    expect(findButton(container, "ให้สิทธิ์ส่งออกรายงาน").disabled).toBe(true);

    render(true);

    expect(findButton(container, "ยกเลิกสิทธิ์ส่งออกรายงาน").disabled).toBe(false);
  });

  it("drops a rapid duplicate submission and does not replay after a rerender", async () => {
    const pending = deferred<WorkforceReportExportGrantActionState>();
    mocks.grant.mockReturnValueOnce(pending.promise);
    render(false);

    await act(async () => {
      submitForm(container, "ให้สิทธิ์ส่งออกรายงาน");
      submitForm(container, "ให้สิทธิ์ส่งออกรายงาน");
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(grantState(true));
      await pending.promise;
    });
    await settle();
    render(false);
    render(false);

    expect(mocks.grant).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("gives another relationship nothing from a pending request", async () => {
    const pending = deferred<WorkforceReportExportGrantActionState>();
    mocks.grant.mockReturnValueOnce(pending.promise);
    render(false);
    await act(async () => {
      submitForm(container, "ให้สิทธิ์ส่งออกรายงาน");
      await Promise.resolve();
    });

    render(false, OTHER_RELATIONSHIP_ID);
    await act(async () => {
      pending.resolve(grantState(true));
      await pending.promise;
    });
    await settle();

    noToast();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("emits one Toast and one refresh under React Strict Mode", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(true));
    act(() =>
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(ReportExportGrantControl, {
            expectedUpdatedAt: V1,
            grant: { granted: false, canGrant: true, canRevoke: true },
            relationshipId: RELATIONSHIP_ID,
            targetHospitalId: HOSPITAL_ID,
          }),
        ),
      ),
    );

    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));
    await settle();

    expect(mocks.grant).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ให้สิทธิ์ส่งออกรายงานแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps Toasts free of identifiers", async () => {
    mocks.grant.mockResolvedValueOnce(grantState(true));
    render(false);
    await act(async () => submitForm(container, "ให้สิทธิ์ส่งออกรายงาน"));

    const serialized = JSON.stringify(toastCalls(mocks));
    expect(serialized).not.toContain(RELATIONSHIP_ID);
    expect(serialized).not.toContain(HOSPITAL_ID);
  });
});

describe("Workforce release control Toasts", () => {
  function render(relationshipId = RELATIONSHIP_ID): void {
    act(() =>
      root.render(
        createElement(WorkforceReleaseControl, {
          relationshipId,
          hospitalId: HOSPITAL_ID,
          kind: "osm",
          updatedAt: V1,
        }),
      ),
    );
  }

  const released: WorkforceReleaseActionState = {
    success: true,
    outcome: "RELEASED",
    message: "นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่",
  };

  function release(outcome: WorkforceReleaseActionState["outcome"], success = false): WorkforceReleaseActionState {
    return { success, outcome, message: `ผลลัพธ์ ${String(outcome)} จากระบบ` };
  }

  function confirmationInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>("#release-confirmation");
    if (!input) throw new Error("Missing confirmation input");
    return input;
  }

  async function submitRelease(): Promise<void> {
    await act(async () => submitForm(container, "ยืนยันนำออกจากระบบถาวร"));
    await settle();
  }

  it("announces a confirmed release once, keeps the inline result, locks the form, and issues no client refresh", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();

    await act(async () => {
      submitForm(container, "ยืนยันนำออกจากระบบถาวร");
      await Promise.resolve();
    });
    expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });
    await settle();

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("นำความสัมพันธ์ออกจากระบบแล้ว");
    expect(container.textContent).toContain("นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่");
    expect(confirmationInput().disabled).toBe(true);
    expect(findButton(container, "ยืนยันนำออกจากระบบถาวร").disabled).toBe(true);
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

  it.each([
    ["CONFLICT", "warning", "ไม่สามารถนำออกจากระบบได้ กรุณาโหลดข้อมูลล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์นำความสัมพันธ์ออกจากระบบ"],
  ] as const)("maps a confirmed %s outcome to a %s Toast with the server text inline", async (outcome, level, message) => {
    mocks.release.mockResolvedValueOnce(release(outcome));
    render();

    await submitRelease();

    expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
    expect(container.textContent).toContain(`ผลลัพธ์ ${outcome} จากระบบ`);
    expect(findButton(container, "ยืนยันนำออกจากระบบถาวร").disabled).toBe(false);
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
    expect(findButton(container, "ยืนยันนำออกจากระบบถาวร").disabled).toBe(true);
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
      submitForm(container, "ยืนยันนำออกจากระบบถาวร");
      submitForm(container, "ยืนยันนำออกจากระบบถาวร");
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
    await act(async () => {
      submitForm(container, "ยืนยันนำออกจากระบบถาวร");
      await Promise.resolve();
    });

    render(OTHER_RELATIONSHIP_ID);
    await act(async () => {
      pending.resolve(released);
      await pending.promise;
    });
    await settle();

    noToast();
    expect(container.textContent).not.toContain("นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่");
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<WorkforceReleaseActionState>();
    mocks.release.mockReturnValueOnce(pending.promise);
    render();
    await act(async () => {
      submitForm(container, "ยืนยันนำออกจากระบบถาวร");
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
      confirmationInput().value = "นำออกจากระบบ";
    });
    await submitRelease();

    const serialized = JSON.stringify(toastCalls(mocks));
    expect(serialized).not.toContain(RELATIONSHIP_ID);
    expect(serialized).not.toContain(HOSPITAL_ID);
    expect(serialized).not.toContain("นำออกจากระบบ\"");
  });
});
