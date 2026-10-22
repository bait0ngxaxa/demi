import {
  FLOATING_CHART_DIMENSIONS,
  type PatientProgramServiceOneFloatingChartScores,
} from "@/modules/patient-program/schemas/patient-program-service-one-schemas";

const WELLBEING_LABEL = "ไม้บรรทัดวัดทุกข์สุข";

const CHART_ROWS = [
  ...FLOATING_CHART_DIMENSIONS,
  { field: "wellbeingScore", label: WELLBEING_LABEL },
] as const;

const CHART = {
  left: 104,
  right: 750,
  baseline: 132,
  scale: 20,
} as const;

type ChartPoint = { x: number; y: number; score: number; label: string };

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : score < 0 ? `−${Math.abs(score)}` : "0";
}

function yForScore(score: number): number {
  return CHART.baseline - score * CHART.scale;
}

function polygon(points: readonly { x: number; y: number }[]): string {
  return `${points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;
}

function areaSegments(points: readonly ChartPoint[]): { above: string[]; below: string[] } {
  const result = { above: [] as string[], below: [] as string[] };

  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];

    if (!first || !second || (first.score === 0 && second.score === 0)) {
      continue;
    }

    const baseline = CHART.baseline;

    if (first.score === 0 || second.score === 0 || Math.sign(first.score) === Math.sign(second.score)) {
      const path = polygon([
        { x: first.x, y: baseline },
        { x: first.x, y: first.y },
        { x: second.x, y: second.y },
        { x: second.x, y: baseline },
      ]);
      result[first.score >= 0 && second.score >= 0 ? "above" : "below"].push(path);
      continue;
    }

    const crossingRatio = first.score / (first.score - second.score);
    const crossingX = first.x + (second.x - first.x) * crossingRatio;

    if (first.score > 0) {
      result.above.push(polygon([
        { x: first.x, y: baseline },
        { x: first.x, y: first.y },
        { x: crossingX, y: baseline },
      ]));
      result.below.push(polygon([
        { x: crossingX, y: baseline },
        { x: second.x, y: second.y },
        { x: second.x, y: baseline },
      ]));
    } else {
      result.below.push(polygon([
        { x: first.x, y: baseline },
        { x: first.x, y: first.y },
        { x: crossingX, y: baseline },
      ]));
      result.above.push(polygon([
        { x: crossingX, y: baseline },
        { x: second.x, y: second.y },
        { x: second.x, y: baseline },
      ]));
    }
  }

  return result;
}

function scoreRows(scores: PatientProgramServiceOneFloatingChartScores) {
  return CHART_ROWS.map(({ field, label }) => ({ label, score: scores[field] }));
}

export function FloatingChartScoreTable({
  scores,
}: {
  scores: PatientProgramServiceOneFloatingChartScores;
}): React.JSX.Element {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">คะแนนอารมณ์และไม้บรรทัดวัดทุกข์สุข</caption>
      <thead>
        <tr className="border-b border-border text-text-muted">
          <th className="py-2 pr-3 font-semibold" scope="col">ด้าน</th>
          <th className="w-20 py-2 text-right font-semibold" scope="col">คะแนน</th>
        </tr>
      </thead>
      <tbody>
        {scoreRows(scores).map(({ label, score }) => (
          <tr className="border-b border-border last:border-0" key={label}>
            <th className="py-2 pr-3 font-medium text-text" scope="row">{label}</th>
            <td className="py-2 text-right font-semibold tabular-nums text-text">{formatScore(score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FloatingChartComparison({
  currentScores,
  roundOneScores,
}: {
  currentScores: PatientProgramServiceOneFloatingChartScores;
  roundOneScores: PatientProgramServiceOneFloatingChartScores | null;
}): React.JSX.Element {
  return (
    <section aria-labelledby="floating-chart-comparison-heading" className="space-y-3 border-t border-border pt-4">
      <h4 className="font-semibold text-text" id="floating-chart-comparison-heading">เปรียบเทียบกับครั้งที่ 1</h4>
      {roundOneScores ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <caption className="sr-only">คะแนนครั้งที่ 1 เทียบครั้งที่ 4 และผลต่าง</caption>
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-3 font-semibold" scope="col">ด้าน</th>
                <th className="px-2 py-2 text-right font-semibold" scope="col">ครั้งที่ 1</th>
                <th className="px-2 py-2 text-right font-semibold" scope="col">ครั้งที่ 4</th>
                <th className="py-2 pl-2 text-right font-semibold" scope="col">เปลี่ยนแปลง</th>
              </tr>
            </thead>
            <tbody>
              {CHART_ROWS.map(({ field, label }) => {
                const roundOne = roundOneScores[field];
                const current = currentScores[field];

                return (
                  <tr className="border-b border-border last:border-0" key={label}>
                    <th className="py-2 pr-3 font-medium text-text" scope="row">{label}</th>
                    <td className="px-2 py-2 text-right tabular-nums text-text">{formatScore(roundOne)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text">{formatScore(current)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-text">{formatScore(current - roundOne)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm leading-6 text-text-muted">ครั้งที่ 1 ยังไม่มีคะแนนจากแบบฟอร์มนี้</p>
      )}
    </section>
  );
}

export function FloatingChartVisualization({
  scores,
}: {
  scores: PatientProgramServiceOneFloatingChartScores | null;
}): React.JSX.Element {
  if (!scores) {
    return <p className="text-sm leading-6 text-text-muted">บันทึกครั้งนี้ยังไม่มีคะแนนจากแบบฟอร์มนี้</p>;
  }

  const points = FLOATING_CHART_DIMENSIONS.map(({ field, label }, index): ChartPoint => {
    const score = scores[field];
    const count = FLOATING_CHART_DIMENSIONS.length - 1;

    return {
      x: CHART.left + ((CHART.right - CHART.left) * index) / count,
      y: yForScore(score),
      score,
      label,
    };
  });
  const areas = areaSegments(points);
  const pointList = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const accessibleValues = points
    .map(({ label, score }) => `${label} ${formatScore(score)}`)
    .join(", ");

  return (
    <div className="space-y-3">
      <figure aria-label="กราฟวัดลอยจม">
        <div aria-label="กราฟวัดลอยจม เลื่อนเพื่อดูกราฟ" className="overflow-x-auto rounded-control border border-border bg-surface-muted" role="region" tabIndex={0}>
          <svg
            aria-label={`กราฟวัดลอยจม: ${accessibleValues}`}
            className="block h-auto w-[780px] max-w-none"
            role="img"
            viewBox="0 0 780 310"
          >
            <text fill="var(--muted)" fontSize="16" textAnchor="middle" transform="translate(27 132) rotate(-90)">คะแนนอารมณ์</text>
            {areas.above.map((path, index) => <path d={path} fill="var(--success-soft)" key={`above-${index}`} />)}
            {areas.below.map((path, index) => <path d={path} fill="var(--warning-soft)" key={`below-${index}`} />)}
            {[5, 0, -5].map((tick) => (
              <g key={tick}>
                <line
                  stroke={tick === 0 ? "var(--brand-strong)" : "var(--line)"}
                  strokeDasharray={tick === 0 ? undefined : "5 6"}
                  strokeWidth={tick === 0 ? 3 : 1.5}
                  x1={CHART.left}
                  x2={CHART.right}
                  y1={yForScore(tick)}
                  y2={yForScore(tick)}
                />
                <text fill="var(--muted)" fontSize="16" textAnchor="end" x="88" y={yForScore(tick) + 5}>
                  {formatScore(tick)}
                </text>
              </g>
            ))}
            <polyline fill="none" points={pointList} stroke="var(--brand-strong)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            {points.map(({ x, y, label, score }) => (
              <g key={label}>
                <circle cx={x} cy={y} fill="var(--surface)" r="7" stroke="var(--brand-strong)" strokeWidth="3" />
                <text fill="var(--ink)" fontSize="16" fontWeight="600" textAnchor="middle" x={x} y="270">{label}</text>
                <text fill="var(--brand-strong)" fontSize="16" fontWeight="700" textAnchor="middle" x={x} y={y - 13}>{formatScore(score)}</text>
              </g>
            ))}
            <text fill="var(--success)" fontSize="15" fontWeight="600" x={CHART.right - 36} y="35">ลอย</text>
            <text fill="var(--warning)" fontSize="15" fontWeight="600" x={CHART.right - 36} y="221">จม</text>
          </svg>
        </div>
        <figcaption className="sr-only">{`กราฟวัดลอยจม คะแนนอารมณ์: ${accessibleValues}`}</figcaption>
      </figure>
      <FloatingChartScoreTable scores={scores} />
    </div>
  );
}

export const floatingChartDisplayInternals = {
  areaSegments,
  formatScore,
  yForScore,
};
