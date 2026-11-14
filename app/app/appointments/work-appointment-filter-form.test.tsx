// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { createFormSubmitDestinationUrl } from "next/dist/client/form-shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";

import { WorkAppointmentView } from "./work-appointment-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// The App Router Form needs Next's bundler; mark the element so the test can tell it came from next/form.
vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form data-next-form="" {...props}>{children}</form> }));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const page = {
  hospital: { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", access: "DIRECT", canCreate: false, canResolveRequests: true, canAcceptAssignments: false },
  hospitals: [
    { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก" },
    { hospitalId: "hospital-b", hospitalName: "โรงพยาบาล ข" },
  ],
  tab: "UPCOMING",
  filters: { status: "SCHEDULED", dateFrom: "2026-11-01" },
  items: [],
  nextCursor: null,
  responsibleFilter: { mode: "VISIBLE", options: [{ userId: "doctor", displayName: "หมอ ก" }] },
  canCreate: false,
  canResolveRequests: true,
  canAcceptAssignments: false,
} as unknown as WorkAppointmentPage;

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

async function renderForm(): Promise<HTMLFormElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<WorkAppointmentView page={page} queryError={null} />));
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  return container.querySelector<HTMLFormElement>('form[action="/app/appointments"]')!;
}

describe("appointment list filter form", () => {
  it("is a next/form with the same action, fields and defaults and no native GET method", async () => {
    const form = await renderForm();

    expect(form.hasAttribute("data-next-form")).toBe(true);
    expect(form.getAttribute("method")).toBeNull();
    expect([...new FormData(form).entries()]).toEqual([
      ["tab", "UPCOMING"],
      ["hospitalId", "hospital-a"],
      ["dateFrom", "2026-11-01"],
      ["dateTo", ""],
      ["status", "SCHEDULED"],
      ["type", ""],
      ["locationType", ""],
      ["responsibleUserId", ""],
      ["awaitingOsmAcceptance", ""],
      ["unassignedOsm", ""],
      ["unassigned", ""],
    ]);
  });

  it("navigates to the URL a native GET submit would load, empty fields included", async () => {
    const form = await renderForm();
    const submitter = [...form.querySelectorAll("button")].find((button) => button.textContent === "ค้นหา")!;
    const native = new URLSearchParams(new FormData(form, submitter) as unknown as string[][]).toString();

    // next/form serializes the form without its submitter; the search button carries no name, so nothing is lost.
    expect(submitter.hasAttribute("name")).toBe(false);
    const target = createFormSubmitDestinationUrl("/app/appointments", form);
    expect(target.pathname).toBe("/app/appointments");
    expect(target.search).toBe(`?${native}`);
    expect(target.search)
      .toBe("?tab=UPCOMING&hospitalId=hospital-a&dateFrom=2026-11-01&dateTo=&status=SCHEDULED&type=&locationType=&responsibleUserId=&awaitingOsmAcceptance=&unassignedOsm=&unassigned=");
  });
});
