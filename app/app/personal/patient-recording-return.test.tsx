// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mark: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  addRoundPlanItemAction: vi.fn(), removeRoundPlanItemAction: vi.fn(), markCustomItemDoneAction: mocks.mark, unmarkCustomItemDoneAction: vi.fn(), addProgramRoundAction: vi.fn(),
}));

import { CustomItemDoneForm } from "../patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor";

let container: HTMLDivElement;
let root: Root;
const returnHref = "/app/personal/care#service-relationship";

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("recording return to ติดตาม", () => {
  async function submit(): Promise<void> {
    act(() => root.render(<CustomItemDoneForm planItemId="item" target={{ patientProgramId: "program", patientHospitalRelationshipId: "relationship", roundNumber: 1 }} submissionNonce="nonce" nextHref={returnHref} />));
    const button = container.querySelector("button");
    if (!button) throw new Error("Missing record button");
    await act(async () => button.click());
  }

  it("uses the existing action and nonce and returns to the Hospital anchor after success", async () => {
    mocks.mark.mockResolvedValue({ status: "SUCCESS" });
    await submit();
    const data: unknown = mocks.mark.mock.calls[0]?.[1];
    expect(data).toBeInstanceOf(FormData);
    if (!(data instanceof FormData)) throw new Error("Missing submission data");
    expect(data.get("submissionNonce")).toBe("nonce");
    expect(data.get("planItemId")).toBe("item");
    expect(mocks.push).toHaveBeenCalledWith(returnHref);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps an unsuccessful recording on the form", async () => {
    mocks.mark.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่สามารถบันทึกรายการนี้ได้" });
    await submit();
    expect(container.textContent).toContain("ไม่สามารถบันทึกรายการนี้ได้");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
