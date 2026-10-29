// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { roundGuideline, type RoundStepState } from "../domain/round-steps";
import { formatRoundDate, roundStepStatusLabel } from "./round-labels";
import { RoundStepTimeline } from "./round-step-timeline";

const at = new Date("2026-10-01T03:00:00Z");
const steps: RoundStepState[] = roundGuideline(1).slice(0, 4).map((definition, index) => ({
  ...definition,
  planItemId: null,
  status: (["DONE", "SKIPPED", "LOCKED", "TODO"] as const)[index],
  evidence: index === 0 ? { at, byDisplayName: "สมศรี ผู้บันทึก" } : null,
  skip: index === 1 ? { planItemId: `item-${index}`, stepCode: definition.code, reasonCode: "OTHER", note: "ผู้ป่วยเหนื่อย", at, byDisplayName: null } : null,
  missingMeasurements: [],
}));

function render(overrides: Partial<Parameters<typeof RoundStepTimeline>[0]> = {}): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(RoundStepTimeline, {
    steps, roundNumber: 1, completion: null, locked: false, ...overrides,
  }));
  return container;
}

describe("RoundStepTimeline", () => {
  it("keeps every number, visible label, status and state icon; summary is last", () => {
    const document = render({ roundNumber: 3 });
    const nodes = document.querySelectorAll("li");
    expect(nodes).toHaveLength(5);
    steps.forEach((step, index) => {
      expect(nodes[index].textContent).toContain(String(index + 1));
      expect(nodes[index].textContent).toContain(step.label);
      expect(nodes[index].textContent).toContain(roundStepStatusLabel(step));
      expect(nodes[index].querySelector("svg")).not.toBeNull();
    });
    expect(nodes[4].textContent).toContain("5สรุปและจบบริการครั้งที่ 3");
    expect(nodes[2].textContent).toContain("ต้องจบครั้งที่ 2 ก่อน");
    expect(nodes[3].textContent).toContain("ยังไม่ได้บันทึก");
    expect(nodes[0].querySelector("li > span")?.className).toContain("bg-brand");
    expect(nodes[1].querySelector("li > span")?.className).toContain("bg-brand");
    expect(nodes[2].querySelector("li > span")?.className).toContain("bg-border");
    expect(nodes[3].querySelector("li > span")?.className).toContain("bg-border");
    expect(nodes[4].querySelector("li > span")).toBeNull();
  });

  it("shows DONE date and only a supplied recorder; SKIPPED reason and date", () => {
    const document = render();
    const nodes = document.querySelectorAll("li");
    expect(nodes[0].textContent).toContain(`${formatRoundDate(at)} · สมศรี ผู้บันทึก`);
    expect(nodes[1].textContent).toContain(`เหตุผลที่ข้าม: อื่น ๆ: ผู้ป่วยเหนื่อย · ${formatRoundDate(at)}`);
    const anonymous = render({ steps: [{ ...steps[0], evidence: { at, byDisplayName: null } }] });
    expect(anonymous.textContent).toContain(formatRoundDate(at));
    expect(anonymous.textContent).not.toContain("สมศรี");
    expect(render({ steps: [{ ...steps[0], evidence: { at: null, byDisplayName: null } }] }).textContent).toContain("ไม่ระบุวันที่");
  });

  it("links every node and marks only the current step, including summary", () => {
    const hrefForStep = (code: string): string => `/round?step=${code}`;
    const document = render({ currentStep: steps[1].code, hrefForStep });
    expect(document.querySelectorAll("a")).toHaveLength(5);
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(document.querySelector('[aria-current="step"]')?.getAttribute("href")).toBe(`/round?step=${steps[1].code}`);
    expect(render({ currentStep: "SUMMARY", hrefForStep }).querySelector('[aria-current="step"]')?.getAttribute("href")).toBe("/round?step=SUMMARY");
  });

  it("renders static mode without links and shows completed/locked summary metadata", () => {
    expect(render().querySelector("a")).toBeNull();
    const completion = { completedAt: at, completedByDisplayName: "สมศรี ผู้บันทึก" };
    expect(render({ completion }).querySelector("li:last-child")?.textContent).toContain(`${formatRoundDate(at)} · สมศรี ผู้บันทึก`);
    const anonymous = render({ completion: { ...completion, completedByDisplayName: null } });
    expect(anonymous.querySelector("li:last-child")?.textContent).not.toContain("สมศรี");
    expect(render({ locked: true, roundNumber: 3 }).querySelector("li:last-child")?.textContent).toContain("ต้องจบครั้งที่ 2 ก่อน");
  });
});
