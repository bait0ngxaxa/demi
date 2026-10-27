import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { chartableBars, countValue, reportingChartValueText, type ReportingChartCategory } from "./chart-value";
import { CountBarChart } from "./count-bar-chart";
import { ProgramStatusDonut } from "./program-status-donut";

const categories: readonly ReportingChartCategory[] = [
  { key: "a", axisLabel: "0 รอบ", label: "ครบ 0 รอบ", value: countValue(1_250), href: "/app/hospitals/reporting?progress=0" },
  { key: "b", axisLabel: "1 รอบ", label: "ครบ 1 รอบ", value: countValue(0) },
  { key: "c", axisLabel: "ซ่อน", label: "ค่าที่ไม่แสดง", value: { state: "SUPPRESSED" } },
  { key: "d", axisLabel: "ไม่มี", label: "ค่าที่ยังไม่พร้อม", value: { state: "UNAVAILABLE" } },
];

function renderBars(input: readonly ReportingChartCategory[], scaleMax?: number): string {
  return renderToStaticMarkup(createElement(CountBarChart, {
    headingId: "bars", title: "กราฟทดสอบ", description: "คำอธิบาย", categories: input,
    emptyMessage: "ยังไม่มีข้อมูลในกราฟนี้", listLabel: "รายการตัวเลข", scaleMax,
  }));
}

describe("reporting chart values", () => {
  it("draws only counts and keeps unavailable and suppressed values non-numeric", () => {
    expect(chartableBars(categories)).toEqual([
      { key: "a", axisLabel: "0 รอบ", value: 1_250 },
      { key: "b", axisLabel: "1 รอบ", value: 0 },
    ]);
    expect(reportingChartValueText(countValue(0))).toBe("0");
    expect(reportingChartValueText({ state: "UNAVAILABLE" })).toBe("ยังไม่พร้อมใช้งาน");
    expect(reportingChartValueText({ state: "SUPPRESSED" })).toBe("ไม่แสดงค่า");
  });
});

describe("CountBarChart", () => {
  it("gives every category a labelled text equivalent and keeps the drawn chart out of the accessibility tree", () => {
    const html = renderBars(categories);

    expect(html).toContain('aria-labelledby="bars"');
    expect(html).toContain('<h3 class="text-lg font-semibold text-text" id="bars">กราฟทดสอบ</h3>');
    expect(html).toContain('aria-label="รายการตัวเลข"');
    expect(html).toContain("1,250");
    expect(html).toContain("ครบ 1 รอบ");
    expect(html).toContain('href="/app/hospitals/reporting?progress=0"');
    expect(html).toContain("ไม่แสดงค่า");
    expect(html).toContain("ยังไม่พร้อมใช้งาน");
    expect(html).toContain('aria-hidden="true"');
  });

  it("states an empty chart in text when every count is a true zero", () => {
    const html = renderBars([{ key: "z", axisLabel: "0", label: "ศูนย์", value: countValue(0) }], 0);
    expect(html).toContain("ยังไม่มีข้อมูลในกราฟนี้");
    expect(html).not.toMatch(/aria-hidden="true" class="min-w-0"/u);
    expect(html).toContain("ศูนย์");
  });

  it("draws nothing and never shows zero when no value is a count", () => {
    const html = renderBars([{ key: "u", axisLabel: "u", label: "ไม่ทราบ", value: { state: "UNAVAILABLE" } }]);
    expect(html).toContain("ยังไม่มีค่าที่แสดงเป็นกราฟได้");
    expect(html).not.toMatch(/>0</u);
  });
});

describe("ProgramStatusDonut", () => {
  it("shows exact ACTIVE / COMPLETED counts with status links and lifecycle-only wording", () => {
    const html = renderToStaticMarkup(createElement(ProgramStatusDonut, {
      headingId: "status", active: 7, completed: 3,
      hrefs: { active: "/r?status=ACTIVE", completed: "/r?status=COMPLETED" },
    }));
    expect(html).toContain("Program ที่กำลังดำเนิน");
    expect(html).toContain("Program ที่สิ้นสุดแล้ว");
    expect(html).toMatch(/>7</u);
    expect(html).toMatch(/>3</u);
    expect(html).toContain('href="/r?status=ACTIVE"');
    expect(html).toContain("ไม่ใช่ผลลัพธ์หรือความสำเร็จทางการรักษา");
    // No percentage anywhere in the visible text: status shares are not treatment success.
    expect(html).not.toMatch(/>[^<]*%[^<]*</u);
  });

  it("replaces the donut with an empty message when the cohort has no Programs", () => {
    const html = renderToStaticMarkup(createElement(ProgramStatusDonut, { headingId: "status", active: 0, completed: 0 }));
    expect(html).toContain("ยังไม่มี Program ในชุดข้อมูลนี้");
    expect(html).not.toContain("href=");
  });
});
