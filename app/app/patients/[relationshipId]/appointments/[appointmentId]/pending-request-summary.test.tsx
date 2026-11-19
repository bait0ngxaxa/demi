// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PendingRequestSummary } from "./pending-request-summary";

const appointmentId = "22222222-2222-4222-8222-222222222222";
const submittedAt = new Date("2026-11-18T02:30:00Z");
const preferred = new Date("2026-11-25T03:00:00Z");
const cancellationRequests = [
  { status: "REJECTED", source: "PATIENT_SELF" as const, submittedAt: new Date("2026-11-01T00:00:00Z") },
  { status: "PENDING", source: "OSM_PROXY" as const, submittedAt },
];
const rescheduleRequests = [{ status: "PENDING", source: "PATIENT_SELF" as const, submittedAt, preferredDatetimes: [preferred] }];
const reviewer: ComponentProps<typeof PendingRequestSummary> = {
  appointmentId,
  status: "SCHEDULED",
  cancellation: { canDecide: true, requests: cancellationRequests },
  reschedule: { canDecide: true, requests: rescheduleRequests },
};

function render(props: ComponentProps<typeof PendingRequestSummary>): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(<PendingRequestSummary {...props} />);
  return template.content;
}

const formatted = (value: Date): string =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);

describe("pending request summary on the appointment detail", () => {
  it("tells a reviewer each pending kind, who asked, when, and where to decide", () => {
    const markup = render(reviewer);
    const entries = [...markup.querySelectorAll("li")];
    expect(markup.textContent).toContain("คำขอรอคุณพิจารณา");
    expect(entries.map((entry) => entry.textContent)).toEqual([
      `ขอยกเลิกนัด — จากอสม. แทนผู้ป่วย เมื่อ ${formatted(submittedAt)} ไปที่คำขอ`,
      `ขอเลื่อนนัด — จากผู้ป่วย เมื่อ ${formatted(submittedAt)} · วันที่ต้องการ ${formatted(preferred)} ไปที่คำขอ`,
    ]);
    expect(entries.map((entry) => entry.querySelector("a")?.getAttribute("href"))).toEqual([
      "#appointment-cancellation-review-heading",
      `#reschedule-requests-heading-${appointmentId}`,
    ]);
  });

  it("lists only the kinds the viewer can decide", () => {
    const markup = render({ ...reviewer, reschedule: { ...reviewer.reschedule, canDecide: false } });
    expect([...markup.querySelectorAll("li")].map((entry) => entry.querySelector(".font-semibold")?.textContent)).toEqual(["ขอยกเลิกนัด"]);
  });

  it.each([
    ["a viewer who cannot decide", { ...reviewer, cancellation: { ...reviewer.cancellation, canDecide: false }, reschedule: { ...reviewer.reschedule, canDecide: false } }],
    ["an appointment that is no longer scheduled", { ...reviewer, status: "CANCELLED" as const }],
    ["no pending request", { ...reviewer, cancellation: { canDecide: true, requests: cancellationRequests.slice(0, 1) }, reschedule: { canDecide: true, requests: [] } }],
  ])("renders nothing for %s", (_name, props) => {
    expect(renderToStaticMarkup(<PendingRequestSummary {...props} />)).toBe("");
  });
});
