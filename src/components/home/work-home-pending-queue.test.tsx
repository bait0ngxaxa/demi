// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PendingActionIndicator, PendingActionsResult } from "@/modules/pending-actions/services/pending-action-service";
import { WorkHomePendingQueue } from "./work-home-pending-queue";

const requests: PendingActionIndicator = {
  navigationHref: "/app/patients/service-requests",
  href: "/app/patients/service-requests?group=PENDING",
  label: "คำขอรับบริการรอพิจารณา",
  count: 1234,
};
const appointments: PendingActionIndicator = {
  navigationHref: "/app/appointments",
  href: "/app/appointments?tab=PENDING_REQUESTS&hospitalId=a",
  label: "คำขอนัดหมายรอพิจารณา",
  count: 12,
};
const hospitalNames = new Map([
  ["a", "โรงพยาบาลหนึ่ง"],
  ["b", "โรงพยาบาลสอง"],
  ["c", "โรงพยาบาลสาม"],
  ["d", "โรงพยาบาลสี่"],
  ["e", "โรงพยาบาลห้า"],
]);

function renderQueue(result: PendingActionsResult): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(<WorkHomePendingQueue hospitalNames={hospitalNames} result={result} />);
  return template.content;
}

function withHospitalQueue(hospitals: { hospitalId: string; count: number }[]): PendingActionIndicator {
  return { ...appointments, hospitalQueue: { tab: "PENDING_REQUESTS", hospitals } };
}

describe("WorkHomePendingQueue", () => {
  it("links positive indicators in service order and gives each link a name that includes the count", () => {
    const markup = renderQueue({
      status: "READY",
      checkedAt: 1,
      indicators: [requests, { ...appointments, count: 0 }, { ...appointments, count: 12 }],
    });
    const links = [...markup.querySelectorAll("li > a")];
    expect(markup.querySelector("h2")?.textContent).toBe("รอคุณดำเนินการ");
    expect(markup.textContent).toContain("รวมทุกโรงพยาบาลที่คุณมีสิทธิ์");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([requests.href, appointments.href]);
    expect(links.map((link) =>
      link.getAttribute("aria-labelledby")?.split(" ").map((id) => markup.getElementById(id)?.textContent).join(" "),
    )).toEqual(["คำขอรับบริการรอพิจารณา 1,234 รายการ", "คำขอนัดหมายรอพิจารณา 12 รายการ"]);
    expect(markup.querySelector("[aria-describedby]")).toBeNull();
  });

  it("names up to three nonempty known hospitals and excludes unknown ids from the remainder", () => {
    const markup = renderQueue({
      status: "READY",
      checkedAt: 1,
      indicators: [withHospitalQueue([
        { hospitalId: "a", count: 3 },
        { hospitalId: "unknown", count: 2 },
        { hospitalId: "b", count: 2 },
        { hospitalId: "c", count: 4 },
        { hospitalId: "d", count: 1 },
        { hospitalId: "e", count: 0 },
      ])],
    });
    const descriptionId = markup.querySelector("a")?.getAttribute("aria-describedby") ?? "";
    expect(markup.getElementById(descriptionId)?.textContent).toBe("โรงพยาบาลหนึ่ง 3 · โรงพยาบาลสอง 2 · โรงพยาบาลสาม 4 และอีก 1 แห่ง");
    expect(markup.textContent).not.toMatch(/unknown|โรงพยาบาลสี่|โรงพยาบาลห้า/);
  });

  it("omits the breakdown when only one known hospital has waiting work", () => {
    const markup = renderQueue({
      status: "READY",
      checkedAt: 1,
      indicators: [withHospitalQueue([
        { hospitalId: "a", count: 10 },
        { hospitalId: "b", count: 0 },
        { hospitalId: "unknown", count: 2 },
      ])],
    });
    expect(markup.querySelector("a[aria-describedby]")).toBeNull();
    expect(markup.textContent).not.toContain("โรงพยาบาลหนึ่ง");
  });

  it.each([
    { name: "all-zero", indicators: [{ ...requests, count: 0 }, { ...appointments, count: 0 }] },
    { name: "no indicators", indicators: [] },
  ])("shows the verified empty state with $name", ({ indicators }) => {
    const markup = renderQueue({ status: "READY", checkedAt: 1, indicators });
    expect(markup.textContent).toContain("ไม่มีงานรอดำเนินการในตอนนี้");
    expect(markup.querySelector("a")).toBeNull();
  });

  it("shows the unavailable state without zero or an empty-queue message", () => {
    const markup = renderQueue({ status: "UNAVAILABLE", checkedAt: 1 });
    expect(markup.textContent).toContain("ยังตรวจสอบงานที่รอดำเนินการไม่ได้ ลองโหลดหน้าใหม่อีกครั้ง");
    expect(markup.textContent).not.toMatch(/0|ไม่มีงานรอดำเนินการในตอนนี้/);
    expect(markup.querySelector("a")).toBeNull();
  });
});
