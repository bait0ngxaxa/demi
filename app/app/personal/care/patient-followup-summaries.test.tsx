// @vitest-environment jsdom

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { computeFollowupAchievement } from "@/modules/followups/domain/followup-achievement";
import type {
  PatientSelfFollowupDetail,
  PatientSelfFollowupSummary,
  PatientSelfGoalPlanDetail,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import { PatientSelfFollowupDetailView } from "../patient-self-record-detail-views";
import { PatientFollowupSummaries } from "./patient-followup-summaries";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const relationship = { relationshipId, hospitalCode: "H", hospitalName: "รพ.ก", hospitalNumber: null, hospitalStatus: "ACTIVE" as const, careEndedAt: null };
const serviceDate = new Date("2026-11-17T00:00:00.000Z");
const above = computeFollowupAchievement([{ goalActivityCode: "walk", status: "DONE", achievedDays: 18 }], [{ activityCode: "walk", targetDays: 25 }]);
const below = computeFollowupAchievement([{ goalActivityCode: "walk", status: "PARTIAL", achievedDays: 12 }], [{ activityCode: "walk", targetDays: 25 }]);

function summary(overrides: Partial<PatientSelfFollowupSummary>): PatientSelfFollowupSummary {
  return { followupId: "f", roundNumber: 4, serviceDate, recordedAt: serviceDate, achievement: null, planAdjusted: null, hasObstacle: null, ...overrides };
}

const plan: PatientSelfGoalPlanDetail = {
  goalPlanId: "plan-1", roundNumber: 2, createdAt: serviceDate, primaryGoalLabel: "น้ำหนักลด", program: null, relationship,
  primaryGoalNote: null, weeklyNote: null, items: [{ activityLabel: "เดินออกกำลังกาย", targetDays: 5, targetValue: 30, targetUnit: "minutes" }],
};

function dom(markup: string): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = markup;
  return root;
}

describe("การติดตาม tab", () => {
  it("shows each Follow-up's result, the strict 70% badge only above it, and no rate when unscorable", () => {
    const root = dom(renderToStaticMarkup(<PatientFollowupSummaries plan={plan} relationshipId={relationshipId} followups={[
      summary({ followupId: "f4", roundNumber: 4, achievement: above, planAdjusted: false, hasObstacle: true }),
      summary({ followupId: "f3", roundNumber: 3, achievement: below, planAdjusted: true, hasObstacle: false }),
      summary({ followupId: "f0", roundNumber: null }),
    ]} />));
    const rows = [...root.querySelectorAll("li")].filter((row) => row.querySelector('a[href*="/followups/"]'));
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("ครั้งที่ 4 · ติดตาม 17 พฤศจิกายน 2569");
    expect(rows[0]?.textContent).toContain("ทำได้ 18 จาก 25 วัน · อัตราความสำเร็จ 72%");
    expect(rows[0]?.textContent).toContain("เกิน 70%");
    expect(rows[0]?.textContent).toContain("ปรับแผน: ไม่ปรับ · อุปสรรค: มี");
    expect(rows[1]?.textContent).toContain("48%");
    expect(rows[1]?.textContent).not.toContain("70%");
    expect(rows[2]?.textContent).toBe("ก่อนเริ่มโปรแกรม · ติดตาม 17 พฤศจิกายน 2569");
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe(`/app/personal/care/${relationshipId}/followups/f4`);
    expect(root.textContent).toContain("แผนสุขภาพที่ใช้ติดตาม");
    expect(root.textContent).toContain("เดินออกกำลังกาย · 5 วัน/สัปดาห์");
    expect(root.querySelector(`a[href="/app/personal/care/${relationshipId}/goal-plans/plan-1"]`)?.textContent).toBe("ดูแผนสุขภาพ");
  });

  it("says when Follow-ups begin when there are none", () => {
    const markup = renderToStaticMarkup(<PatientFollowupSummaries followups={[]} plan={null} relationshipId={relationshipId} />);
    expect(markup).toContain("การติดตามผลเริ่มตั้งแต่ครั้งที่ 3");
    expect(markup).not.toContain("แผนสุขภาพที่ใช้ติดตาม");
  });
});

describe("patient Follow-up detail", () => {
  const program = { status: "ACTIVE" as const, startedAt: serviceDate, completedAt: null };
  const detail: PatientSelfFollowupDetail = {
    followupId: "f4", roundNumber: 2, recordedAt: serviceDate, serviceDate, program, relationship,
    planAdjusted: false, hasObstacle: true,
    measurements: { weight: null, waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null },
    activityProgress: [
      { activityLabel: "เดินออกกำลังกาย", status: "DONE", achievedDays: 18, targetDays: 25 },
      { activityLabel: "ลดหวาน", status: "NOT_APPLICABLE", achievedDays: null, targetDays: 7 },
    ],
    achievement: above,
  };

  it("shows the service round, date, per-activity days, total, rate, plan change and obstacle", () => {
    const root = dom(renderToStaticMarkup(<PatientSelfFollowupDetailView detail={detail} />));
    expect(root.querySelector("h1")?.textContent).toBe("ครั้งที่ 4 · การติดตาม");
    expect(root.textContent).toContain("วันที่ติดตาม");
    expect(root.textContent).toContain("ทำได้ 18 จาก 25 วัน · อัตราความสำเร็จ 72%");
    expect(root.textContent).toContain("เกิน 70%");
    expect(root.textContent).toContain("ปรับแผนไม่ปรับ");
    expect(root.textContent).toContain("อุปสรรคมี");
    expect(root.textContent).not.toContain("ทำได้ null");
    expect(root.querySelector(`a[href="/app/personal/care?tab=followups&relationshipId=${relationshipId}"]`)?.textContent).toBe("บริการ");
  });

  it("titles a relationship-only Follow-up and shows no rate when it cannot be scored", () => {
    const root = dom(renderToStaticMarkup(<PatientSelfFollowupDetailView detail={{ ...detail, program: null, achievement: null, planAdjusted: null, hasObstacle: null }} />));
    expect(root.querySelector("h1")?.textContent).toBe("ก่อนเริ่มโปรแกรม · การติดตาม");
    expect(root.textContent).not.toContain("อัตราความสำเร็จ");
    expect(root.textContent).not.toContain("ปรับแผน");
    expect(root.textContent).not.toContain("อุปสรรค");
  });
});

describe("patient copy guard", () => {
  it("leaves no 'ติดตาม รอบที่' wording under app/app/personal", async () => {
    const personal = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = (await readdir(personal, { recursive: true }))
      .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file));
    const offenders: string[] = [];
    for (const file of files) {
      if ((await readFile(join(personal, file), "utf8")).includes("ติดตาม รอบที่")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
