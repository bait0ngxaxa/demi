"use client";

import { RoundReportTable } from "@/modules/reporting/presentation/round-report-table";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { LocalNavigation } from "@/components/ui/local-navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChevronGlyph } from "@/components/ui/glyphs";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { CountBarChart } from "@/components/reporting-charts/count-bar-chart";
import { ProgramStatusDonut } from "@/components/reporting-charts/program-status-donut";
import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportMeasurementSet,
  HospitalReportProgramRow,
  HospitalReportCompactProgramRow,
  HospitalReportingPageProjection,
} from "@/modules/reporting/projections/hospital-report-projection";
import { summarizeFollowupAchievements } from "@/modules/followups/domain/followup-achievement";
import { PROMS_RESULT_LABELS } from "@/modules/screening/presentation/screening-labels";
import type { HospitalReportCohort, HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

import { ExportPreview, PROGRAM_ENTRY_HREF } from "./export-preview";
import { HospitalReportTargetSelector } from "./hospital-report-target-selector";
import { downloadReportFile } from "./report-download";
import {
  SERVICE_PROCESS_CHART_DESCRIPTION,
  roundProgressCategories,
  serviceProcessCategories,
  serviceProcessNote,
} from "./report-chart-categories";

type ReportView = "overview" | "service";

/** Adds `query` to `href`, which may already carry a query (the Hospital operator route keeps `hospitalId` there). */
function appendQuery(href: string, query: string): string {
  if (query === "") return href;
  return `${href}${href.includes("?") ? "&" : "?"}${query}`;
}

/** A GET form drops the action's own query, so the href is split into the action path and hidden fields. */
function formTarget(href: string): { action: string; fields: readonly [string, string][] } {
  const queryStart = href.indexOf("?");
  if (queryStart === -1) return { action: href, fields: [] };
  return { action: href.slice(0, queryStart), fields: [...new URLSearchParams(href.slice(queryStart + 1)).entries()] };
}

const REPORT_VIEWS: readonly { label: string; value: ReportView }[] = [
  { label: "ภาพรวม", value: "overview" },
  { label: "รายงานการจัดบริการ", value: "service" },
];

function factText<T extends number | string>(fact: HospitalReportFact<T>): string {
  if (fact.state === "RECORDED") {
    return typeof fact.value === "number" ? fact.value.toLocaleString("th-TH") : fact.value;
  }
  if (fact.state === "NOT_RECORDED") return "ยังไม่บันทึก";
  return "ยังไม่พร้อมใช้งาน";
}

function unavailableText(reason: HospitalReportProgramRow["unavailable"][keyof HospitalReportProgramRow["unavailable"]]): string {
  switch (reason) {
    case "SOURCE_MISSING": return "ไม่มีแหล่งข้อมูลในระบบ";
    case "CLINICAL_SEMANTICS_UNAPPROVED": return "มีข้อมูลต้นทาง แต่ความหมายหรือหน่วยยังไม่ได้รับรอง";
    case "NOT_PROGRAM_SCOPED": return "ข้อมูลที่มีไม่ได้ผูกกับโปรแกรมนี้";
    case "DERIVATION_UNAPPROVED": return "ยังไม่มีสูตรคำนวณที่ได้รับรอง";
  }
}

// D9: Patient self-reported; "ไม่มีบันทึก" when no entry with a duration falls in the 28-day window.
function weeklyExerciseText(fact: HospitalReportFact<number>): string {
  return fact.state === "RECORDED" ? `${fact.value.toLocaleString("th-TH")} นาที (ผู้ป่วยบันทึกเอง)` : "ไม่มีบันทึก";
}

// Q6: PROMs shows มีปัญหา/ไม่มีปัญหา; a legacy combined screening keeps its total.
function promsReportText(proms: HospitalReportProgramRow["screening"]["proms"]): string {
  if (proms.state === "MISSING") return "ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1";
  if ("legacyTotal" in proms.value) return `คะแนนรวม ${proms.value.legacyTotal} (ชุดเดิม)`;
  return proms.value.hasProblem ? PROMS_RESULT_LABELS.problem : PROMS_RESULT_LABELS.noProblem;
}

function recordText<T>(record: { state: "PRESENT"; value: T } | { state: "MISSING" }): string {
  return record.state === "PRESENT" ? "มีบันทึก" : "ไม่มีบันทึกในโปรแกรมนี้";
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function displayDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function hierarchyStatusLabel(status: HospitalHierarchyContext["hospital"]["status"]): string {
  switch (status) {
    case "ACTIVE": return "ใช้งานอยู่";
    case "SUSPENDED": return "ระงับการใช้งาน";
    case "PENDING_VERIFICATION": return "รอยืนยันการขึ้นทะเบียน";
    case "RETIRED": return "ถอนออกจากรายชื่อ";
  }
}

function hierarchyStatusVariant(status: HospitalHierarchyContext["hospital"]["status"]): "success" | "danger" | "warning" | "neutral" {
  switch (status) {
    case "ACTIVE": return "success";
    case "SUSPENDED": return "danger";
    case "PENDING_VERIFICATION": return "warning";
    case "RETIRED": return "neutral";
  }
}

function networkClassificationLabel(classification: HospitalHierarchyContext["classification"]): string {
  switch (classification) {
    case "MAIN": return "โรงพยาบาลแม่ข่าย";
    case "SUBORDINATE": return "โรงพยาบาลลูกข่าย / หน่วยบริการในเครือ";
    case "UNASSIGNED": return "ยังไม่อยู่ในเครือข่าย";
  }
}

function HospitalReportingHierarchy({ hierarchy, network }: {
  hierarchy: HospitalHierarchyContext;
  network?: ParentChildHospitalReportTargetGroup;
}): React.JSX.Element {
  if (network) return <p className="mt-4 break-words text-sm text-text-muted">
    ลูกข่าย {network.children.length} แห่ง · <Link className="inline-flex min-h-11 items-center text-brand-strong underline" href="/app/hospitals/reporting?scope=network">ดูลูกข่าย</Link>
  </p>;
  return <p className="mt-4 break-words text-sm text-text-muted">
    {hierarchy.parentHospital ? `แม่ข่าย: ${hierarchy.parentHospital.name}` : hierarchy.classification === "MAIN"
      ? `ลูกข่าย ${hierarchy.directChildCount} แห่ง` : "ยังไม่อยู่ในเครือข่าย"}
  </p>;
}

function SummaryMetric({ label, value, hint }: { label: string; value: number; hint?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-text">{value.toLocaleString("th-TH")}</dd>
      {hint ? <p className="mt-1 text-xs leading-5 text-text-muted">{hint}</p> : null}
    </div>
  );
}

function MeasurementList({
  measurements,
}: {
  measurements: HospitalReportMeasurementSet;
}): React.JSX.Element {
  const fields: readonly { key: keyof HospitalReportMeasurementSet; label: string; unit: string }[] = [
    { key: "bloodSugar", label: "น้ำตาลปลายนิ้ว (DTX)", unit: "" },
    { key: "weight", label: "น้ำหนัก", unit: "กก." },
    { key: "waistCircumference", label: "รอบเอว", unit: "ซม." },
    { key: "systolicBloodPressure", label: "ความดันตัวบน", unit: "มม.ปรอท" },
    { key: "diastolicBloodPressure", label: "ความดันตัวล่าง", unit: "มม.ปรอท" },
  ];

  return (
    <dl className="grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2">
      {fields.map(({ key, label, unit }) => (
        <div className="min-w-0 border-b border-border pb-2" key={key}>
          <dt className="text-sm text-text-muted">{label}</dt>
          <dd className="mt-1 break-words font-medium text-text">
            {factText(measurements[key])}{measurements[key].state === "RECORDED" && unit ? ` ${unit}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProgramContext({ program }: { program: HospitalReportProgramRow }): React.JSX.Element {
  const hospitalNumber = factText(program.patient.hospitalNumber);
  const completedAt = program.lifecycle.completedAt.state === "RECORDED"
    ? displayDate(program.lifecycle.completedAt.value)
    : program.lifecycle.status === "ACTIVE"
      ? "โปรแกรมกำลังดำเนินอยู่"
      : "ยังไม่บันทึกวันที่สิ้นสุด";

  return (
    <dl className="grid min-w-0 gap-x-6 gap-y-3 @2xl/workspace:grid-cols-2 @5xl/workspace:grid-cols-4">
      <div className="min-w-0"><dt className="text-sm text-text-muted">รหัสผู้ป่วยในโรงพยาบาล</dt><dd className="mt-1 break-words font-medium">{hospitalNumber}</dd></div>
      <div className="min-w-0"><dt className="text-sm text-text-muted">เริ่มโปรแกรม</dt><dd className="mt-1 break-words font-medium">{displayDate(program.lifecycle.startedAt)}</dd></div>
      <div className="min-w-0"><dt className="text-sm text-text-muted">วันที่สิ้นสุด</dt><dd className="mt-1 break-words font-medium">{completedAt}</dd></div>
      <div className="min-w-0"><dt className="text-sm text-text-muted">อสม. ที่มอบหมายปัจจุบัน</dt><dd className="mt-1 break-words font-medium">{program.currentRelationshipOsmAssignment.state === "PRESENT" ? program.currentRelationshipOsmAssignment.value.displayName : "ไม่มีการมอบหมายปัจจุบัน"}</dd></div>
    </dl>
  );
}

function ProgramDetailAccess({
  program,
  allowed,
}: {
  program: HospitalReportProgramRow;
  allowed: boolean;
}): React.JSX.Element | null {
  return allowed ? (
    <Link
      className={buttonClassName({ variant: "secondary", size: "compact" })}
      href={`/app/patients/${program.patientHospitalRelationshipId}/programs/${program.patientProgramId}/report`}
    >
      เปิดรายละเอียดโปรแกรม
    </Link>
  ) : null;
}

// Rendered inside the expanded row: the summary already names the patient and status.
function ProgramOverviewBody({
  program,
  allowProgramDetail,
}: {
  program: HospitalReportProgramRow;
  allowProgramDetail: boolean;
}): React.JSX.Element {
  return (
    <>
      <div className="grid min-w-0 gap-6 py-5 @5xl/workspace:grid-cols-3">
        <section aria-labelledby={`before-${program.patientProgramId}`} className="min-w-0">
          <h3 className="mb-3 font-semibold text-text" id={`before-${program.patientProgramId}`}>ก่อนเริ่ม · ข้อมูลตั้งต้น</h3>
          {program.baseline.state === "PRESENT" ? (
            <>
              <p className="mb-3 text-sm text-text-muted">บันทึกวันที่ {displayDate(program.baseline.value.recordedOn)}</p>
              <MeasurementList measurements={program.baseline.value.measurements} />
              <p className="mt-3 text-sm text-text-muted">ส่วนสูง: {factText(program.baseline.value.heightCm)}{program.baseline.value.heightCm.state === "RECORDED" ? " ซม." : ""}</p>
            </>
          ) : <p className="text-sm text-text-muted">ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้</p>}
          <ul className="mt-3 space-y-1 text-sm text-text-muted">
            <li>ความเสี่ยงโรคหัวใจและหลอดเลือด (CVD Risk %): {program.baseline.state === "PRESENT" ? factText(program.baseline.value.cvdRiskScore) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้"}</li>
            <li>HbA1c (%): {program.baseline.state === "PRESENT" ? factText(program.baseline.value.hba1c) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้"}</li>
            <li>BMI (kg/m²): {program.baseline.state === "PRESENT" ? factText(program.bmi.baseline) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้"}</li>
          </ul>
        </section>

        <section aria-labelledby={`during-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 @5xl/workspace:border-l @5xl/workspace:border-t-0 @5xl/workspace:pl-6 @5xl/workspace:pt-0">
          <h3 className="mb-3 font-semibold text-text" id={`during-${program.patientProgramId}`}>ระหว่างโปรแกรม · การติดตามผล</h3>
          <ul className="mb-4 space-y-1 text-sm text-text-muted">
            {([["ครั้งที่ 1", program.roundVitals.round1], ["ครั้งที่ 2", program.roundVitals.round2]] as const).map(([label, vitals]) => (
              <li key={label}>
                {label} · DTX: {vitals.state === "PRESENT" ? factText(vitals.value.measurements.bloodSugar) : "ยังไม่บันทึกสัญญาณชีพ"}
                {" · "}น้ำหนัก: {vitals.state === "PRESENT" ? factText(vitals.value.measurements.weight) : "ยังไม่บันทึกสัญญาณชีพ"}
              </li>
            ))}
          </ul>
          {program.followups.items.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีบันทึกติดตามผลในโปรแกรมนี้</p> : (
            <ol className="space-y-4">
              {program.followups.items.map((followup) => (
                <li className="min-w-0 border-b border-border pb-4 last:border-b-0" key={followup.id}>
                  <h4 className="font-medium text-text">ครั้งที่ {followup.roundNumber} · บันทึก {displayDateTime(followup.recordedAt)}</h4>
                  <div className="mt-3"><MeasurementList measurements={followup.measurements} /></div>
                </li>
              ))}
            </ol>
          )}
          {program.followups.hasMore ? <p className="mt-2 text-sm text-text-muted">แสดง {program.followups.items.length} จาก {program.followups.totalCount} รายการ · {allowProgramDetail ? "ดูรายละเอียดทั้งหมดได้ที่รายงานโปรแกรม" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
        </section>

        <section aria-labelledby={`after-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 @5xl/workspace:border-l @5xl/workspace:border-t-0 @5xl/workspace:pl-6 @5xl/workspace:pt-0">
          <h3 className="mb-3 font-semibold text-text" id={`after-${program.patientProgramId}`}>หลังจบโปรแกรม · การประเมินครั้งสุดท้าย</h3>
          {program.finalAssessment.state === "PRESENT" ? (
            <>
              <p className="mb-3 text-sm text-text-muted">วันที่ประเมิน {program.finalAssessment.value.serviceDate ?? "ไม่ได้บันทึก"} · บันทึกวันที่ {displayDateTime(program.finalAssessment.value.recordedAt)}</p>
              <MeasurementList measurements={program.finalAssessment.value.measurements} />
            </>
          ) : <p className="text-sm text-text-muted">ไม่มีการประเมินหลังจบโปรแกรมที่บันทึกไว้</p>}
          <ul className="mt-3 space-y-1 text-sm text-text-muted">
            <li>ความเสี่ยงโรคหัวใจและหลอดเลือด (CVD Risk %): {program.finalAssessment.state === "PRESENT" ? factText(program.finalAssessment.value.cvdRiskScore) : "ไม่มีการประเมินหลังจบโปรแกรม"}</li>
            <li>HbA1c (%): {program.finalAssessment.state === "PRESENT" ? factText(program.finalAssessment.value.hba1c) : "ไม่มีการประเมินหลังจบโปรแกรม"}</li>
            <li>BMI (kg/m²): {program.finalAssessment.state === "PRESENT" ? factText(program.bmi.after) : "ไม่มีการประเมินหลังจบโปรแกรม"}</li>
            <li>ส่วนสูงล่าสุดที่บันทึก (ใช้คำนวณ BMI): {factText(program.latestHeightCm)}</li>
          </ul>
        </section>
      </div>

      <div className="flex flex-col gap-3 pt-4 @2xl/workspace:flex-row @2xl/workspace:items-center @2xl/workspace:justify-between">
        <p className="break-words text-xs text-text-muted">ระยะเวลาที่ป่วย: {program.illnessDuration.state === "RECORDED" ? `${program.illnessDuration.value} ปี` : "ไม่ทราบปีวินิจฉัย"}</p>
        <ProgramDetailAccess allowed={allowProgramDetail} program={program} />
      </div>
    </>
  );
}

function ServiceOne({ program }: { program: HospitalReportProgramRow }): React.JSX.Element {
  const services: readonly { key: keyof HospitalReportProgramRow["serviceOne"]; label: string }[] = [
    { key: "floatingChart", label: "กราฟวัดลอยจม" },
    { key: "dreamCard", label: "การ์ดความฝัน" },
    { key: "routine", label: "ตารางกิจวัตร" },
    { key: "confidence", label: "บันทึกคะแนนความมั่นใจ" },
  ];
  return (
    <dl className="grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2">
      {services.map(({ key, label }) => {
        const record = program.serviceOne[key];
        return <div className="min-w-0" key={key}><dt className="text-sm text-text-muted">{label}</dt><dd className="mt-1 font-medium">{recordText(record)}</dd>{record.state === "PRESENT" ? <dd className="mt-1 text-xs text-text-muted">บันทึกเมื่อ {displayDateTime(record.value.recordedAt)}</dd> : null}</div>;
      })}
    </dl>
  );
}

function answerText(answer: boolean | null, yes: string, no: string): string {
  if (answer === null) return "ไม่ได้บันทึก";
  return answer ? yes : no;
}

function achievementText(followup: HospitalReportFollowup): string {
  if (followup.achievement === null) return "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้";
  return `${followup.achievement.achievedDays}/${followup.achievement.targetDays} วัน · ${followup.achievement.ratePercent}%`;
}

function achievementOver70Text(program: HospitalReportProgramRow): string {
  if (program.followups.hasMore) return "ดูได้ในไฟล์ Excel (แสดงการติดตามไม่ครบในหน้านี้)";
  if (program.followups.items.length === 0) return "ไม่มีการติดตาม";
  const summary = summarizeFollowupAchievements(program.followups.items.map((followup) => followup.achievement));
  return summary.scoredCount === 0
    ? "ไม่มีการติดตามที่คำนวณได้"
    : `${summary.aboveThresholdCount} จาก ${summary.scoredCount} ครั้งที่คำนวณได้`;
}

function ServiceFollowup({ followup }: { followup: HospitalReportFollowup }): React.JSX.Element {
  return (
    <li className="min-w-0 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <h4 className="font-semibold text-text">ครั้งที่ {followup.roundNumber} · บันทึก {displayDateTime(followup.recordedAt)}</h4>
      <p className="mt-1 text-sm text-text-muted">วันที่ให้บริการ: {followup.serviceDate ?? "ไม่ได้บันทึก"}</p>
      <div className="mt-3"><MeasurementList measurements={followup.measurements} /></div>
      <ul className="mt-3 space-y-1 text-sm text-text-muted">
        <li>วันที่ทำได้ / อัตราความสำเร็จ: {achievementText(followup)}</li>
        <li>ปรับแผนใหม่: {answerText(followup.planAdjusted, "ปรับ", "ไม่ปรับ")} · อุปสรรค: {answerText(followup.hasObstacle, "มี", "ไม่มี")}</li>
      </ul>
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-text">ความคืบหน้ากิจกรรมที่บันทึก</h5>
        {followup.activityProgress.length === 0 ? <p className="mt-1 text-sm text-text-muted">ไม่มีรายการความคืบหน้ากิจกรรมในการติดตามผลครั้งนี้</p> : (
          <ul className="mt-2 space-y-2">
            {followup.activityProgress.map((item, index) => (
              <li className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:justify-between" key={`${item.activityCode}-${index}`}>
                <span className="break-words">{item.activityLabel}</span>
                <span className="text-text-muted">{item.status === "DONE" ? "บันทึกว่าทำได้" : item.status === "PARTIAL" ? "บันทึกว่าทำได้บางส่วน" : item.status === "NOT_DONE" ? "บันทึกว่ายังทำไม่ได้" : "บันทึกว่าไม่เกี่ยวข้อง"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// Rendered inside the expanded row: the summary already names the patient and status.
function ServiceProgramBody({
  program,
  allowProgramDetail,
}: {
  program: HospitalReportProgramRow;
  allowProgramDetail: boolean;
}): React.JSX.Element {
  const goalPlans = program.goalPlans.items;
  return (
    <>
      <div className="grid min-w-0 gap-6 py-5 @5xl/workspace:grid-cols-2">
        <section aria-labelledby={`service-before-${program.patientProgramId}`} className="min-w-0">
          <h3 className="mb-3 font-semibold text-text" id={`service-before-${program.patientProgramId}`}>ก่อนเริ่ม · ข้อมูลตั้งต้น</h3>
          {program.baseline.state === "PRESENT" ? <MeasurementList measurements={program.baseline.value.measurements} /> : <p className="text-sm text-text-muted">ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้</p>}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>แบบประเมิน PAM: {program.screening.pam.state === "PRESENT" ? `คะแนน ${program.screening.pam.value.score}` : "ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1"}</li>
            <li>แบบประเมิน PROMs: {promsReportText(program.screening.proms)}</li>
            <li>ไม้บรรทัดวัดใจ (0–10): {program.baseline.state === "PRESENT" ? factText(program.baseline.value.confidenceScore) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับโปรแกรมนี้"}</li>
            <li>เวลาออกกำลังกายต่อสัปดาห์: {weeklyExerciseText(program.weeklyExercise.before)}</li>
          </ul>
          <h3 className="mb-3 mt-6 font-semibold text-text">หลังจบโปรแกรม · ข้อมูลการประเมิน</h3>
          {program.finalAssessment.state === "PRESENT" ? <MeasurementList measurements={program.finalAssessment.value.measurements} /> : <p className="text-sm text-text-muted">ไม่มีการประเมินหลังจบโปรแกรมที่บันทึกไว้</p>}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>เวลาออกกำลังกายต่อสัปดาห์: {program.finalAssessment.state === "PRESENT" ? weeklyExerciseText(program.weeklyExercise.after) : "ไม่มีการประเมินหลังจบโปรแกรม"}</li>
            <li>จำนวนครั้งที่ผลสำเร็จมากกว่า 70%: {achievementOver70Text(program)}</li>
          </ul>
        </section>

        <section aria-labelledby={`service-one-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 @5xl/workspace:border-l @5xl/workspace:border-t-0 @5xl/workspace:pl-6 @5xl/workspace:pt-0">
          <h3 className="mb-3 font-semibold text-text" id={`service-one-${program.patientProgramId}`}>บริการ 1 · รู้จักตัวเอง</h3>
          <ServiceOne program={program} />
        </section>

        <section aria-labelledby={`service-goal-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5">
          <h3 className="mb-3 font-semibold text-text" id={`service-goal-${program.patientProgramId}`}>บริการ 2 · ทำแผนสุขภาพ</h3>
          {goalPlans.length === 0 ? <p className="text-sm text-text-muted">ไม่มีแผนสุขภาพที่ผูกกับโปรแกรมนี้</p> : (
            <ol className="space-y-4">
              {goalPlans.map((plan) => (
                <li className="min-w-0 border-b border-border pb-4 last:border-b-0" key={plan.id}>
                  <h4 className="font-medium">แผนรอบที่ {plan.roundNumber}: {plan.primaryGoalLabel}</h4>
                  {plan.items.length === 0 ? <p className="mt-2 text-sm text-text-muted">ไม่มีเป้าหมายกิจกรรมในแผนนี้</p> : (
                    <ul className="mt-3 space-y-2">
                      {plan.items.map((item) => (
                        <li className="min-w-0 rounded-control border border-border px-3 py-3" key={item.activityCode}>
                          <p className="break-words font-medium">{item.activityLabel}</p>
                          <p className="mt-1 text-sm text-text-muted">เป้าหมาย {item.targetDays} วัน/สัปดาห์ · {factText(item.targetValue)} {factText(item.targetUnit)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          {program.goalPlans.hasMore ? <p className="mt-3 text-sm text-text-muted">แสดง {goalPlans.length} จาก {program.goalPlans.totalCount} แผน · {allowProgramDetail ? "เปิดรายละเอียดโปรแกรมเพื่อดูรายการทั้งหมด" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
          <p className="mt-3 text-sm text-text-muted">ค่าในแผนเป็นเป้าหมายที่บันทึก ไม่ใช่ผลการปฏิบัติ</p>
        </section>

        <section aria-labelledby={`service-followup-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5">
          <h3 className="mb-3 font-semibold text-text" id={`service-followup-${program.patientProgramId}`}>บริการ 3 เป็นต้นไป · การติดตามผลและความคืบหน้า</h3>
          {program.followups.items.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีบันทึกติดตามผลในโปรแกรมนี้</p> : <ol><>{program.followups.items.map((followup) => <ServiceFollowup followup={followup} key={followup.id} />)}</></ol>}
          {program.followups.hasMore ? <p className="mt-3 text-sm text-text-muted">แสดง {program.followups.items.length} จาก {program.followups.totalCount} รายการ · {allowProgramDetail ? "ดูทั้งหมดในรายละเอียดโปรแกรมหรือไฟล์ Excel" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>ผลลัพธ์ที่ได้: {unavailableText(program.unavailable.outcome)}</li>
          </ul>
        </section>
      </div>

      {allowProgramDetail ? (
        <div className="flex justify-end pt-4">
          <ProgramDetailAccess allowed={allowProgramDetail} program={program} />
        </div>
      ) : null}
    </>
  );
}

function CompactProgram({ program, view, allowProgramDetail }: {
  program: HospitalReportCompactProgramRow; view: ReportView; allowProgramDetail: boolean;
}): React.JSX.Element {
  return <details className="group min-w-0 rounded-panel border border-border bg-surface">
    <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 rounded-panel p-4 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring @2xl/workspace:px-6 [&::-webkit-details-marker]:hidden">
      <span className="grid min-w-0 flex-1 gap-2 @2xl/workspace:grid-cols-2 @5xl/workspace:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
        <span className="min-w-0 break-words font-semibold">{program.patient.displayName}</span>
        <span className="min-w-0 break-words text-sm">HN: {factText(program.patient.hospitalNumber)}</span>
        <span className="min-w-0 break-words text-sm">อสม.: {program.currentRelationshipOsmAssignment.state === "PRESENT" ? program.currentRelationshipOsmAssignment.value.displayName : "ยังไม่มอบหมาย"}</span>
        <span className="text-sm">{program.lifecycle.status === "ACTIVE" ? "กำลังดำเนินโปรแกรม" : "สิ้นสุดโปรแกรมแล้ว"}</span>
        <span className="text-sm tabular-nums">จัดบริการแล้ว {program.completedRounds} ครั้ง</span>
        <span className="text-sm">บริการล่าสุด: {program.latestServiceDate ? displayDate(program.latestServiceDate) : "ยังไม่บันทึก"}</span>
      </span>
      <ChevronGlyph className="mt-0.5 size-5 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" direction="down" />
    </summary>
    <div className="divide-y divide-border border-t border-border px-4 pb-4 @2xl/workspace:px-6">
      <div className="py-5"><ProgramContext program={program} /></div>
      <div className="py-5"><RoundReportTable fixedColumns rounds={program.rounds} extraRoundsCompleted={program.extraRoundsCompleted} /></div>
      {view === "overview" ? <ProgramOverviewBody program={program} allowProgramDetail={allowProgramDetail} /> : <ServiceProgramBody program={program} allowProgramDetail={allowProgramDetail} />}
    </div>
  </details>;
}

export function ExportButton({
  hospitalId,
  endpoint,
  cohort = "ACTIVE",
  parentHospitalId,
  accessibleLabel,
}: {
  hospitalId: string;
  endpoint: string;
  cohort?: HospitalReportCohort;
  /** ADR-0013 RPT-32: the Parent locator for the Parent-to-Child summary export; re-authorized on the server. */
  parentHospitalId?: string;
  accessibleLabel?: string;
}): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function download(): Promise<void> {
    setLoading(true);
    setMessage(null);
    setFailed(false);
    const cohortQuery = cohort === "INCLUDE_ENDED" ? "&cohort=INCLUDE_ENDED" : "";
    const parentQuery = parentHospitalId ? `&parentHospitalId=${encodeURIComponent(parentHospitalId)}` : "";
    const result = await downloadReportFile(
      `${endpoint}?hospitalId=${encodeURIComponent(hospitalId)}${cohortQuery}${parentQuery}`,
      "demi-hospital-report.xlsx",
    );
    setMessage(result.message);
    setFailed(!result.ok);
    setLoading(false);
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
      <Button aria-label={accessibleLabel} onClick={() => void download()} loading={loading} type="button">
        {loading ? "กำลังสร้างไฟล์ Excel" : "ส่งออก Excel"}
      </Button>
      {message ? (
        <p className={`max-w-sm text-sm ${failed ? "text-danger" : "text-text-muted"}`} role={failed ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One Hospital's report. The Hospital operator page (`chrome="page"`) renders its own header, Hospital selector and
 * Hospital identity. The platform ADMIN page owns those itself (`chrome="embedded"`), so the workspace starts at the
 * report body, and every in-report link and form stays on `reportHref`.
 */
export function HospitalReportWorkspace({
  hospitals,
  hierarchy,
  initialView,
  page,
  selectedHospitalId,
  audience = "HOSPITAL_OWNER",
  chrome = "page",
  reportHref,
  parentGroups = [],
  selection,
}: {
  hospitals: readonly HospitalReportingHospital[];
  hierarchy: HospitalHierarchyContext;
  initialView: string;
  page: HospitalReportingPageProjection;
  selectedHospitalId: string;
  parentGroups?: readonly ParentChildHospitalReportTargetGroup[];
  selection?: HospitalReportTargetSelection;
} & (
  | { audience?: "HOSPITAL_OWNER"; chrome?: "page"; reportHref?: undefined }
  /** `reportHref` is the selected Hospital's report URL, e.g. `/app/admin/reporting/hospitals/{id}`. */
  | { audience: "GLOBAL_ADMIN"; chrome: "embedded"; reportHref: string }
)): React.JSX.Element {
  const [view, setView] = useState<ReportView>(initialView === "service" ? "service" : "overview");
  const isGlobalAdmin = audience === "GLOBAL_ADMIN";
  const embedded = chrome === "embedded";
  const routeBase = "/app/hospitals/reporting";
  const includesEnded = page.cohort === "INCLUDE_ENDED";
  const hospitalHref = reportHref ?? `${routeBase}?hospitalId=${encodeURIComponent(selectedHospitalId)}`;
  // In-report links (pagination, views) keep the selected cohort.
  const cohortHref = appendQuery(hospitalHref, includesEnded ? "cohort=INCLUDE_ENDED" : "");
  const query = new URLSearchParams(page.filters);
  const baseHref = appendQuery(cohortHref, query.toString());
  const filterForm = formTarget(hospitalHref);
  const allowProgramDetail = !isGlobalAdmin;
  const targetSelection = selection ?? { kind: "DIRECT_OWNER", hospitalId: selectedHospitalId };

  return (
    <div className="content-workspace">
      {embedded ? null : (
        <>
          <HospitalReportTargetSelector
            hospitals={hospitals}
            parentGroups={parentGroups}
            routeBase={routeBase}
            selection={targetSelection}
            view={view}
          />

          <PageHeader
            actions={
              <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
                <ExportButton cohort={page.cohort} endpoint="/api/v1/hospital/reporting/export" hospitalId={selectedHospitalId} />
                {/* ADR-0025: a Parent's network workbook is chosen on the export page. */}
                {parentGroups.some((group) => group.parent.id === selectedHospitalId) ? (
                  <Link className={buttonClassName({ variant: "secondary" })} href="/app/hospitals/reporting/export" prefetch={false}>
                    ส่งออกรายงานเครือข่าย
                  </Link>
                ) : null}
              </div>
            }
            breadcrumbs={[{ label: "งานโรงพยาบาล", href: `/app?hospitalId=${encodeURIComponent(selectedHospitalId)}` }, { label: "รายงานโรงพยาบาล" }]}
            title="รายงานโรงพยาบาล"
          />

          <HospitalReportingHierarchy hierarchy={hierarchy} network={parentGroups.find((group) => group.parent.id === selectedHospitalId)} />
        </>
      )}

      <section aria-labelledby={embedded ? undefined : "hospital-report-context-heading"} className={embedded ? undefined : "mt-6"}>
        {embedded ? null : (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold text-text" id="hospital-report-context-heading">{page.hospital.name}</h2>
              <p className="mt-1 break-words text-sm text-text-muted">{networkClassificationLabel(hierarchy.classification)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge variant={hierarchyStatusVariant(hierarchy.hospital.status)}>{hierarchyStatusLabel(hierarchy.hospital.status)}</StatusBadge>
            </div>
          </div>
        )}

        {isGlobalAdmin ? null : (
          <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="font-semibold text-text">
                {includesEnded ? "รวมผู้ที่สิ้นสุดการดูแลแล้ว" : "เฉพาะผู้ที่ยังอยู่ในการดูแล"}
              </p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {includesEnded
                  ? "ตัวเลขและรายการรวมประวัติของผู้ป่วยที่โรงพยาบาลสิ้นสุดการดูแลแล้ว ไฟล์ Excel ที่ส่งออกใช้ชุดข้อมูลเดียวกัน"
                  : "ผู้ป่วยที่โรงพยาบาลสิ้นสุดการดูแลแล้วไม่ถูกนับในรายงานนี้"}
              </p>
            </div>
            <Link
              className={buttonClassName({ variant: "secondary", size: "compact", className: "shrink-0" })}
              href={appendQuery(hospitalHref, `${includesEnded ? "" : "cohort=INCLUDE_ENDED&"}view=${view}`)}
              prefetch={false}
            >
              {includesEnded ? "แสดงเฉพาะผู้ที่ยังอยู่ในการดูแล" : "รวมผู้ที่สิ้นสุดการดูแล"}
            </Link>
          </div>
        )}

        <dl aria-label="ตัวเลขสรุปของรายงาน" className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 @3xl/workspace:grid-cols-3 @7xl/workspace:grid-cols-6">
          <SummaryMetric hint="นับแยกตามโรงพยาบาล ผู้ป่วยคนเดียวกันอาจมีมากกว่าหนึ่งรายการ" label="รายการผู้ป่วยในโรงพยาบาล" value={page.counts.patientHospitalRelationships.value} />
          <SummaryMetric hint="ผู้ป่วยหนึ่งคนอาจมีหลายโปรแกรม" label="โปรแกรมทั้งหมด" value={page.counts.programs.total} />
          <SummaryMetric label="โปรแกรมที่กำลังดำเนิน" value={page.counts.programs.active} />
          <SummaryMetric label="โปรแกรมที่สิ้นสุดแล้ว" value={page.counts.programs.completed} />
          <SummaryMetric hint="นับรายการผู้ป่วยที่ยังไม่มีโปรแกรมในโรงพยาบาลนี้" label="รายการผู้ป่วยที่ยังไม่มีโปรแกรม" value={page.counts.relationshipsWithoutProgram.value} />
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
            <dt className="text-sm text-text-muted">DM / Pre-DM</dt>
            <dd className="mt-1 font-semibold text-text">ยังสรุปไม่ได้</dd>
            <p className="mt-1 text-xs text-text-muted">ไม่มีนิยามและตัวหารที่ได้รับรองสำหรับรายงานนี้</p>
          </div>
        </dl>
      </section>

      <section aria-labelledby="hospital-report-charts-heading" className="mt-8">
        <h2 className="text-lg font-semibold text-text" id="hospital-report-charts-heading">ภาพรวมการจัดบริการ</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-text-muted">
          ตัวเลขทุกค่าในส่วนนี้นับจากโปรแกรมทั้งหมดของชุดข้อมูลที่เลือก ไม่เปลี่ยนตามการค้นหา ตัวกรอง หรือหน้ารายการด้านล่าง
        </p>
        <div className="mt-4 grid min-w-0 gap-4 @5xl/workspace:grid-cols-2">
          <ProgramStatusDonut
            active={page.counts.programs.active}
            completed={page.counts.programs.completed}
            headingId="hospital-report-status-chart"
            hrefs={{ active: appendQuery(cohortHref, `status=ACTIVE&view=${view}`), completed: appendQuery(cohortHref, `status=COMPLETED&view=${view}`) }}
          />
          <CountBarChart
            categories={serviceProcessCategories(page.serviceProcess)}
            description={SERVICE_PROCESS_CHART_DESCRIPTION}
            emptyMessage="ยังไม่มีโปรแกรมที่มีบันทึกกิจกรรมเหล่านี้"
            headingId="hospital-report-service-process-chart"
            listLabel="จำนวนโปรแกรมที่มีบันทึกกิจกรรมแต่ละประเภท"
            note={serviceProcessNote(page.counts.programs.total)}
            scaleMax={page.counts.programs.total}
            title="บันทึกกิจกรรมบริการ 1"
          />
        </div>
        <div className="mt-4">
          <CountBarChart
            categories={roundProgressCategories(page.roundProgress, (progress) => appendQuery(cohortHref, `progress=${progress}&view=${view}`))}
            description="แต่ละโปรแกรมอยู่ในกลุ่มเดียว รวมทุกกลุ่มเท่ากับโปรแกรมทั้งหมดในชุดข้อมูลนี้ กดชื่อกลุ่มเพื่อกรองรายการโปรแกรมด้านล่าง"
            emptyMessage="ยังไม่มีโปรแกรมในชุดข้อมูลนี้"
            headingId="hospital-report-round-progress-chart"
            listLabel="จำนวนโปรแกรมแยกตามความคืบหน้ารอบบริการ"
            title="ความคืบหน้ารอบบริการ"
          />
        </div>
      </section>
      <div className="mt-5">
        <ExportPreview
          hospitalName={page.hospital.name}
          programEntryHref={isGlobalAdmin ? undefined : PROGRAM_ENTRY_HREF}
          programRows={page.counts.programs.total}
          relationshipsWithoutProgram={page.counts.relationshipsWithoutProgram.value}
        />
      </div>

      <Form action={filterForm.action} className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {filterForm.fields.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <input type="hidden" name="view" value={view} />
        {includesEnded ? <input type="hidden" name="cohort" value="INCLUDE_ENDED" /> : null}
        <label className="min-w-0 text-sm">ชื่อผู้ป่วย / HN<input type="search" name="search" maxLength={100} defaultValue={page.filters.search} key={page.filters.search} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-3 focus-visible:ring-4 focus-visible:ring-focus-ring" /></label>
        <label className="min-w-0 text-sm">ความคืบหน้า<select name="progress" defaultValue={page.filters.progress} key={page.filters.progress} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-3 focus-visible:ring-4 focus-visible:ring-focus-ring">
          <option value="">ทุกรอบ</option>{Array.from({ length: 7 }, (_, round) => <option value={round} key={round}>{round === 6 ? "ครบอย่างน้อย 6 รอบ" : `ครบ ${round} รอบ`}</option>)}<option value="AFTER_RECORDED">บันทึก After แล้ว · รอจบโปรแกรม</option><option value="COMPLETED">สิ้นสุดโปรแกรม</option>
        </select></label>
        <label className="min-w-0 text-sm">สถานะโปรแกรม<select name="status" defaultValue={page.filters.status} key={page.filters.status} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-3 focus-visible:ring-4 focus-visible:ring-focus-ring"><option value="">ทุกสถานะ</option><option value="ACTIVE">กำลังดำเนิน</option><option value="COMPLETED">สิ้นสุดแล้ว</option></select></label>
        <div className="flex flex-wrap items-end gap-2"><PendingSubmitButton pendingLabel="กำลังค้นหา..." variant="secondary">ค้นหา / กรอง</PendingSubmitButton><Link className={buttonClassName({ variant: "secondary" })} href={appendQuery(cohortHref, `view=${view}`)}>ล้างตัวกรอง</Link></div>
      </Form>

      <div className="mt-6 max-w-full overflow-x-auto pb-1">
        <LocalNavigation ariaLabel="มุมมองรายงานโรงพยาบาล" items={REPORT_VIEWS} onChange={setView} value={view} />
      </div>

      <section aria-labelledby={view === "overview" ? "overview-heading" : "service-heading"} className="mt-5">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-text" id={view === "overview" ? "overview-heading" : "service-heading"}>
            {view === "overview" ? "ภาพรวม" : "รายงานการจัดบริการ"}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
            {view === "overview"
              ? "แต่ละแถวคือหนึ่งโปรแกรม กดเพื่อขยาย ผู้ป่วยหนึ่งคนอาจมีหลายโปรแกรม"
              : "การมีบันทึกของแต่ละบริการ เป้าหมาย และความคืบหน้า"}
          </p>
        </div>


        {page.page.items.length === 0 && page.counts.programs.total === 0 ? (
          <Panel>
            <h3 className="font-semibold text-text">ยังไม่มีโปรแกรมที่รายงานได้</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {page.counts.patientHospitalRelationships.value === 0
                ? "ยังไม่มีรายการผู้ป่วยในโรงพยาบาลนี้"
                : `พบรายการผู้ป่วยที่ยังไม่มีโปรแกรม ${page.counts.relationshipsWithoutProgram.value.toLocaleString("th-TH")} รายการ จึงไม่มีโปรแกรมให้แสดง`}
            </p>
          </Panel>
        ) : page.page.items.length === 0 ? (
          <Panel>
            <h3 className="font-semibold text-text">ไม่พบโปรแกรมตามเงื่อนไขนี้</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">ยังมีโปรแกรม {page.counts.programs.total.toLocaleString("th-TH")} รายการในโรงพยาบาลนี้ ลองล้างตัวกรองหรือค้นหาด้วยชื่อ / HN อื่น</p>
            <Link className={`${buttonClassName({ variant: "secondary" })} mt-4`} href={appendQuery(baseHref, `view=${view}`)} prefetch={false}>กลับไปหน้าแรก</Link>
          </Panel>
        ) : (
          <div className="grid min-w-0 gap-4">
            {page.page.items.map((program) => <CompactProgram key={program.patientProgramId} program={program} view={view} allowProgramDetail={allowProgramDetail} />)}
          </div>
        )}
      </section>

      <nav aria-label="หน้ารายการโปรแกรมของรายงานโรงพยาบาล" className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {page.page.previousCursor ? <Link className={buttonClassName({ variant: "secondary" })} href={appendQuery(baseHref, `cursor=${encodeURIComponent(page.page.previousCursor)}&pageSize=${page.page.pageSize}&view=${view}`)} prefetch={false} rel="prev">หน้าก่อนหน้า</Link> : <span aria-disabled="true" className="text-sm text-text-muted">หน้าก่อนหน้า</span>}
        <p className="text-sm text-text-muted">หน้า {page.page.number} จาก {Math.max(1, Math.ceil(page.page.total / page.page.pageSize))} · {page.page.total.toLocaleString("th-TH")} โปรแกรม</p>
        {page.page.nextCursor ? <Link className={buttonClassName({ variant: "secondary" })} href={appendQuery(baseHref, `cursor=${encodeURIComponent(page.page.nextCursor)}&pageSize=${page.page.pageSize}&view=${view}`)} prefetch={false} rel="next">หน้าถัดไป</Link> : <span aria-disabled="true" className="text-sm text-text-muted">หน้าถัดไป</span>}
      </nav>
      <p className="mt-4 text-xs leading-5 text-text-muted">ชื่อ อสม. แสดงเฉพาะผู้ที่ได้รับมอบหมายให้ดูแลผู้ป่วยรายนี้ในปัจจุบัน รายงานนี้ไม่มีข้อมูลผู้ดูแลย้อนหลังของบริการ</p>
    </div>
  );
}
