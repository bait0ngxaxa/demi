import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FLOATING_CHART_DIMENSIONS } from "../schemas/patient-program-service-one-schemas";
import {
  FloatingChartComparison,
  FloatingChartVisualization,
  floatingChartDisplayInternals,
} from "./floating-chart-display";

const scoreFields = {
  familyScore: -5,
  eatingScore: 0,
  workScore: 5,
  healthScore: -5,
  financeScore: 0,
  travelScore: 5,
  exerciseScore: -5,
  wellbeingScore: 0,
};

function pointsFor(scores: readonly number[]) {
  return scores.map((score, index) => ({
    x: index * 100,
    y: floatingChartDisplayInternals.yForScore(score),
    score,
    label: FLOATING_CHART_DIMENSIONS[index]?.label ?? "",
  }));
}

describe("floating chart display", () => {
  it.each([
    { name: "all −5", scores: [-5, -5, -5, -5, -5, -5, -5], shaded: "below" },
    { name: "all 0", scores: [0, 0, 0, 0, 0, 0, 0], shaded: "none" },
    { name: "all 5", scores: [5, 5, 5, 5, 5, 5, 5], shaded: "above" },
  ])("places the $name chart against the 0 baseline", ({ scores, shaded }) => {
    const areas = floatingChartDisplayInternals.areaSegments(pointsFor(scores));

    expect(floatingChartDisplayInternals.yForScore(-5)).toBe(232);
    expect(floatingChartDisplayInternals.yForScore(0)).toBe(132);
    expect(floatingChartDisplayInternals.yForScore(5)).toBe(32);
    if (shaded === "none") {
      expect(areas).toEqual({ above: [], below: [] });
    } else if (shaded === "above") {
      expect(areas.above).toHaveLength(6);
      expect(areas.below).toHaveLength(0);
    } else {
      expect(areas.above).toHaveLength(0);
      expect(areas.below).toHaveLength(6);
    }
  });

  it("splits mixed line segments at the water line", () => {
    const areas = floatingChartDisplayInternals.areaSegments(pointsFor([-5, 5, -5, 0, 5, 0, -5]));

    expect(areas.above.length).toBeGreaterThan(0);
    expect(areas.below.length).toBeGreaterThan(0);
    expect(areas.above.every((path) => path.includes("Z"))).toBe(true);
    expect(areas.below.every((path) => path.includes("Z"))).toBe(true);
  });

  it("lists all seven dimensions and the separate wellbeing ruler in the text table", () => {
    const markup = renderToStaticMarkup(createElement(FloatingChartVisualization, { scores: scoreFields }));
    const svgLabel = markup.match(/<svg aria-label="([^"]*)"/u)?.[1] ?? "";
    const tableMarkup = markup.slice(markup.lastIndexOf("<table"));
    const tableRows = [...tableMarkup.matchAll(/<tr[^>]*><th[^>]*scope="row">([^<]+)<\/th><td[^>]*>([^<]*)<\/td><\/tr>/gu)];

    for (const { label } of FLOATING_CHART_DIMENSIONS) {
      expect(svgLabel).toContain(label);
    }
    expect(svgLabel).not.toContain("ไม้บรรทัดวัดทุกข์สุข");
    expect(tableRows.map(([, label]) => label)).toEqual([
      ...FLOATING_CHART_DIMENSIONS.map(({ label }) => label),
      "ไม้บรรทัดวัดทุกข์สุข",
    ]);
    expect(tableRows.map(([, , value]) => value)).toEqual([
      "−5", "0", "+5", "−5", "0", "+5", "−5", "0",
    ]);
    expect(markup).toContain("คะแนนอารมณ์");
    expect(markup).toContain("ลอย");
    expect(markup).toContain("จม");
  });

  it("shows round 1, round 4 and the change for each score", () => {
    const markup = renderToStaticMarkup(
      createElement(FloatingChartComparison, { currentScores: scoreFields, roundOneScores: { ...scoreFields, familyScore: -3 } }),
    );

    expect(markup).toContain("ครั้งที่ 1");
    expect(markup).toContain("ครั้งที่ 4");
    expect(markup).toContain("เปลี่ยนแปลง");
    expect(markup).toContain("−2");
    expect(markup).toContain("ไม้บรรทัดวัดทุกข์สุข");
  });
});
