// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assign: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  unassign: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next/form", () => ({
  // next/form submits as a GET navigation; a plain form is enough here.
  default: (props: Record<string, unknown>) => {
    const { action, ...rest } = props;
    void action;
    return createElement("form", rest);
  },
}));
vi.mock("@/modules/patient-assignment/transport/server-actions", () => ({
  assignOsmToPatientAction: mocks.assign,
  unassignOsmFromPatientAction: mocks.unassign,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { PatientOsmAssignmentWorkspace } from "./patient-osm-assignment-workspace";

const patient = {
  displayName: "สมชาย ใจดี",
  hospitalNumber: "HN-001",
  hospital: { id: "hospital-1", name: "โรงพยาบาลทดสอบ" },
};
const candidates = [
  { userId: "osm-1", displayName: "สมใจ อสม." },
  { userId: "osm-2", displayName: "สมหมาย อสม." },
];
const current = { assignmentId: "assignment-1", osmUserId: "osm-1", osmDisplayName: "สมใจ อสม.", assignedAt: "2026-10-01T00:00:00.000Z" };

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(currentAssignment: typeof current | null, relationshipId = "relationship-1"): void {
  act(() =>
    root.render(
      createElement(PatientOsmAssignmentWorkspace, {
        relationshipId,
        patient: patient as never,
        currentAssignment,
        candidates: candidates as never,
        candidateSearch: "",
        candidateError: null,
      }),
    ),
  );
}

function result(operation: string, overrides: Record<string, unknown> = {}) {
  return {
    status: "SUCCESS",
    result: {
      operation,
      patientHospitalRelationshipId: "relationship-1",
      hospitalId: "hospital-1",
      assignmentId: "assignment-2",
      osmUserId: "osm-2",
      previousOsmUserId: null,
      ...overrides,
    },
  };
}

function assignForm(): HTMLFormElement {
  return container.querySelector<HTMLFormElement>('form:has(select[name="osmUserId"])')!;
}

function unassignForm(): HTMLFormElement {
  return Array.from(container.querySelectorAll("form")).find((form) => form.textContent?.includes("ยกเลิกการมอบหมาย"))!;
}

async function assign(osmUserId = "osm-2"): Promise<void> {
  assignForm().querySelector<HTMLSelectElement>("select")!.value = osmUserId;
  await act(async () => {
    assignForm().requestSubmit();
  });
}

async function unassign(): Promise<void> {
  await act(async () => {
    unassignForm().requestSubmit();
  });
}

function allToasts(): string {
  return JSON.stringify([mocks.notifySuccess.mock.calls, mocks.notifyWarning.mock.calls, mocks.notifyError.mock.calls]);
}

describe("single OSM assignment feedback", () => {
  it("announces an initial assignment from the service operation, once", async () => {
    mocks.assign.mockResolvedValue(result("ASSIGNED"));
    render(null);

    await assign();

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("มอบหมาย อสม. แล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(allToasts()).not.toContain("สมใจ");
    expect(allToasts()).not.toContain("สมชาย");

    render(null);
    render(null);
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("announces a reassignment differently from an assignment", async () => {
    mocks.assign.mockResolvedValue(result("REASSIGNED", { previousOsmUserId: "osm-1" }));
    render(current);

    await assign();

    expect(mocks.notifySuccess).toHaveBeenCalledWith("เปลี่ยน อสม. ผู้รับผิดชอบแล้ว");
  });

  it("announces an unassignment", async () => {
    mocks.unassign.mockResolvedValue(result("UNASSIGNED", { osmUserId: null, previousOsmUserId: "osm-1" }));
    render(current);

    await unassign();

    expect(mocks.notifySuccess).toHaveBeenCalledWith("ยกเลิกการมอบหมาย อสม. แล้ว");
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("gives no Toast for a NOOP and keeps the inline explanation", async () => {
    mocks.assign.mockResolvedValue(result("NOOP", { osmUserId: "osm-1" }));
    render(current);

    await assign("osm-1");

    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("เป็นสถานะปัจจุบันอยู่แล้ว");
  });

  it("keeps invalid input inline, warns on CONFLICT with a refresh, errors on FORBIDDEN", async () => {
    mocks.assign.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "กรุณาเลือก อสม." });
    render(null);
    await assign();
    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("กรุณาเลือก อสม.");

    mocks.assign.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "เปลี่ยนแปลงแล้ว" });
    await assign();
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    mocks.assign.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
    await assign();
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["returned UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }],
    ["returned IDLE", { status: "IDLE" }],
    ["a result for another relationship", result("ASSIGNED", { patientHospitalRelationshipId: "relationship-9" })],
    ["a different OSM than requested", result("ASSIGNED", { osmUserId: "osm-1" })],
    ["an operation an assignment cannot produce", result("UNASSIGNED")],
  ])("treats %s as unconfirmed: no Toast, no refresh, controls locked", async (_label, response) => {
    mocks.assign.mockResolvedValue(response);
    render(null);

    await assign();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(assignForm().querySelector<HTMLButtonElement>("button[type=submit]")!.disabled).toBe(true);
    expect(mocks.assign).toHaveBeenCalledTimes(1);
  });

  it("does not let an unassign start while an assign is in flight", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.assign.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(current);

    await act(async () => {
      assignForm().querySelector<HTMLSelectElement>("select")!.value = "osm-2";
      assignForm().requestSubmit();
      unassignForm().requestSubmit();
    });

    expect(mocks.assign).toHaveBeenCalledTimes(1);
    expect(mocks.unassign).not.toHaveBeenCalled();

    await act(async () => {
      resolve(result("REASSIGNED", { previousOsmUserId: "osm-1" }));
    });
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("sends one request for two synchronous submits", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.assign.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(null);

    await act(async () => {
      assignForm().querySelector<HTMLSelectElement>("select")!.value = "osm-2";
      assignForm().requestSubmit();
      assignForm().requestSubmit();
    });

    expect(mocks.assign).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(result("ASSIGNED"));
    });
  });

  it("gives no Toast or refresh after the workspace moved to another relationship", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.assign.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(null, "relationship-1");
    await assign();

    render(null, "relationship-2");
    await act(async () => {
      resolve(result("ASSIGNED"));
    });

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("gives no Toast when unmounted before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.assign.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(null);
    await assign();

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      resolve(result("ASSIGNED"));
    });

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
