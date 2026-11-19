import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientHealthSummary } from "./patient-health-summary";

describe("PatientHealthSummary", () => {
  it("renders a PageHeader with the health description and hospital context", () => {
    const selected = { relationshipId: "rel-1", hospitalName: "โรงพยาบาลเดมิ", hospitalPhone: null };
    const html = renderToStaticMarkup(<PatientHealthSummary hospitals={[selected]} selected={selected} summary={null} />);
    const header = html.match(/<header[^>]*>[\s\S]*?<\/header>/u)?.[0];
    expect(header).toContain("bg-header-surface");
    expect(header).toContain("ข้อมูลสุขภาพ");
    expect(header).not.toContain("สรุปข้อมูลสุขภาพของคุณจากโรงพยาบาลที่เลือก");
    expect(header).toContain("โรงพยาบาลเดมิ");
    expect(html).not.toContain('aria-labelledby="health-heading"');
  });
});
