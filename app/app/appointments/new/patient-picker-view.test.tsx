// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { createFormSubmitDestinationUrl } from "next/dist/client/form-shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { WorkAppointmentHospitalScope } from "@/modules/appointments/services/work-appointment-query-service";

import { AppointmentPatientPicker } from "./patient-picker-view";

// The App Router Form needs Next's bundler; mark the element so the test can tell it came from next/form.
vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form data-next-form="" {...props}>{children}</form> }));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const scopes: WorkAppointmentHospitalScope[] = [
  { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", access: "DIRECT", canCreate: true, canResolveRequests: false, canAcceptAssignments: false },
  { hospitalId: "hospital-b", hospitalName: "โรงพยาบาล ข", access: "DIRECT", canCreate: true, canResolveRequests: false, canAcceptAssignments: false },
];

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

async function renderForm(value: string): Promise<HTMLFormElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AppointmentPatientPicker currentPage={1} errorMessage={null} items={[]} lookupType="HOSPITAL_NUMBER" scopes={scopes}
      selectedScope={scopes[1]} total={0} totalPages={0} value={value} />,
  ));
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  return container.querySelector<HTMLFormElement>('form[action="/app/appointments/new"]')!;
}

describe("appointment patient picker search form", () => {
  it("is a next/form with the same action, fields and defaults and no native GET method", async () => {
    const form = await renderForm("HN-001");

    expect(form.hasAttribute("data-next-form")).toBe(true);
    expect(form.getAttribute("method")).toBeNull();
    expect([...new FormData(form).entries()]).toEqual([["hospitalId", "hospital-b"], ["lookupType", "HOSPITAL_NUMBER"], ["value", "HN-001"]]);
  });

  it.each([["HN-001", "?hospitalId=hospital-b&lookupType=HOSPITAL_NUMBER&value=HN-001"], ["", "?hospitalId=hospital-b&lookupType=HOSPITAL_NUMBER&value="]])(
    "navigates to the URL a native GET submit would load (value %j)",
    async (value, search) => {
      const form = await renderForm(value);
      const submitter = [...form.querySelectorAll("button")].find((button) => button.textContent === "ค้นหาผู้ป่วย")!;
      const native = new URLSearchParams(new FormData(form, submitter) as unknown as string[][]).toString();

      expect(submitter.hasAttribute("name")).toBe(false);
      const target = createFormSubmitDestinationUrl("/app/appointments/new", form);
      expect(target.pathname).toBe("/app/appointments/new");
      expect(target.search).toBe(`?${native}`);
      expect(target.search).toBe(search);
    },
  );
});
