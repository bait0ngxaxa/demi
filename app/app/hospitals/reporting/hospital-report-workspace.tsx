"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { LocalNavigation } from "@/components/ui/local-navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportMeasurementSet,
  HospitalReportProgramRow,
  HospitalReportingPageProjection,
} from "@/modules/reporting/projections/hospital-report-projection";
import { summarizeFollowupAchievements } from "@/modules/followups/domain/followup-achievement";
import type { HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

import { HospitalReportTargetSelector } from "./hospital-report-target-selector";

type ReportView = "overview" | "service";

const REPORT_VIEWS: readonly { label: string; value: ReportView }[] = [
  { label: "Dashboard ภาพรวม", value: "overview" },
  { label: "รายงานการจัดบริการ", value: "service" },
];

function factText<T extends number | string>(fact: HospitalReportFact<T>): string {
  if (fact.state === "RECORDED") {
    return typeof fact.value === "number" ? fact.value.toLocaleString("th-TH") : fact.value;
  }
  if (fact.state === "NOT_RECORDED") return "ยังไม่บันทึก";
  return "ยังไม่พร้อมใช้งาน";
}

function factStatus<T extends number | string>(fact: HospitalReportFact<T>): string {
  if (fact.state === "RECORDED") return "มีข้อมูลบันทึก";
  if (fact.state === "NOT_RECORDED") return "ยังไม่บันทึก";
  return unavailableText(fact.reason);
}

function unavailableText(reason: HospitalReportProgramRow["unavailable"][keyof HospitalReportProgramRow["unavailable"]]): string {
  switch (reason) {
    case "SOURCE_MISSING": return "ไม่มีแหล่งข้อมูลในระบบ";
    case "CLINICAL_SEMANTICS_UNAPPROVED": return "มีข้อมูลต้นทาง แต่ความหมายหรือหน่วยยังไม่ได้รับรอง";
    case "NOT_PROGRAM_SCOPED": return "ข้อมูลที่มีไม่ได้ผูกกับ Program นี้";
    case "DERIVATION_UNAPPROVED": return "ยังไม่มีสูตรคำนวณที่ได้รับรอง";
  }
}

function recordText<T>(record: { state: "PRESENT"; value: T } | { state: "MISSING" }): string {
  return record.state === "PRESENT" ? "มีบันทึก" : "ไม่มีบันทึกใน Program นี้";
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
    case "SUSPENDED": return "ถูกระงับ";
    case "PENDING_VERIFICATION": return "รอยืนยันการขึ้นทะเบียน";
  }
}

function hierarchyStatusVariant(status: HospitalHierarchyContext["hospital"]["status"]): "success" | "danger" | "warning" {
  switch (status) {
    case "ACTIVE": return "success";
    case "SUSPENDED": return "danger";
    case "PENDING_VERIFICATION": return "warning";
  }
}

function hierarchyIssueLabel(issue: HospitalHierarchyContext["issues"][number]): string {
  switch (issue.code) {
    case "MISSING_PARENT": return "ไม่พบโรงพยาบาลแม่ข่ายที่อ้างอิง";
    case "SELF_PARENT": return "หน่วยนี้อ้างอิงตัวเองเป็นโรงพยาบาลแม่ข่าย";
    case "CYCLE": return "พบวงจรในความสัมพันธ์ของโรงพยาบาล";
    case "PARENT_IS_SUBORDINATE": return "โรงพยาบาลแม่ข่ายที่อ้างอิงเป็นโรงพยาบาลลูกข่าย";
    case "PARENT_INVALID": return "ไม่สามารถยืนยันความสัมพันธ์กับโรงพยาบาลแม่ข่ายได้";
    case "DUPLICATE_IDENTITY": return "พบข้อมูลโรงพยาบาลซ้ำ";
  }
}

function HospitalReportingHierarchy({
  hierarchy,
}: {
  hierarchy: HospitalHierarchyContext;
}): React.JSX.Element {
  const isMain = hierarchy.classification === "MAIN";
  const hospital = hierarchy.hospital;

  return (
    <section aria-labelledby="hospital-hierarchy-context-heading" className="mt-6">
      <Panel className="min-w-0 p-5 sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text" id="hospital-hierarchy-context-heading">
              โครงสร้างโรงพยาบาล
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              โรงพยาบาลที่เลือก: {hospital.name} ({hospital.hospitalCode})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info">
              {isMain ? "โรงพยาบาลแม่ข่าย" : "โรงพยาบาลลูกข่าย / หน่วยบริการในเครือ"}
            </StatusBadge>
            <StatusBadge variant={hierarchyStatusVariant(hospital.status)}>
              {hierarchyStatusLabel(hospital.status)}
            </StatusBadge>
          </div>
        </div>

        {isMain ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm leading-6 text-text-muted">
              หน่วยบริการในเครือโดยตรง {hierarchy.directChildCount.toLocaleString("th-TH")} แห่ง
            </p>
            {hierarchy.directChildren.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">ยังไม่มีโรงพยาบาลลูกข่ายโดยตรง</p>
            ) : (
              <ul aria-label="โรงพยาบาลลูกข่ายโดยตรง" className="mt-2 divide-y divide-border border-t border-border">
                {hierarchy.directChildren.map((child) => (
                  <li className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" key={child.id}>
                    <div className="min-w-0">
                      <p className="break-words font-medium text-text">{child.name}</p>
                      <p className="text-sm text-text-muted">รหัส {child.hospitalCode}</p>
                    </div>
                    <StatusBadge variant={hierarchyStatusVariant(child.status)}>
                      {hierarchyStatusLabel(child.status)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-text-muted">โรงพยาบาลแม่ข่าย</p>
            {hierarchy.parentHospital ? (
              <div className="mt-1 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="break-words font-medium text-text">
                  {hierarchy.parentHospital.name} ({hierarchy.parentHospital.hospitalCode})
                </p>
                <StatusBadge variant={hierarchyStatusVariant(hierarchy.parentHospital.status)}>
                  {hierarchyStatusLabel(hierarchy.parentHospital.status)}
                </StatusBadge>
              </div>
            ) : (
              <p className="mt-1 text-sm text-danger-strong">ไม่พบข้อมูลโรงพยาบาลแม่ข่าย</p>
            )}
          </div>
        )}

        {hierarchy.issues.length > 0 ? (
          <Alert className="mt-4" variant="warning">
            <p className="font-semibold">พบความสัมพันธ์ที่ต้องตรวจสอบ</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
              {hierarchy.issues.map((issue) => (
                <li key={`${issue.code}:${issue.hospitalId}:${issue.parentHospitalCode ?? "none"}`}>
                  {hierarchyIssueLabel(issue)}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <Alert className="mt-4" variant="info">
          ข้อมูลผู้ป่วยและ Program ในรายงานนี้เป็นของโรงพยาบาลที่เลือกเท่านั้น ไม่รวมข้อมูลของโรงพยาบาลลูกข่ายหรือโรงพยาบาลอื่น
        </Alert>

        <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
          <div className="border-t border-border py-3">
            <dt className="font-semibold text-text">รายงานผู้ป่วย / Program</dt>
            <dd className="mt-1 text-sm leading-6 text-text-muted">แสดงข้อมูลของโรงพยาบาลที่เลือกโดยตรง</dd>
          </div>
          <div className="border-t border-border py-3">
            <dt className="font-semibold text-text">โครงสร้างเครือข่ายโรงพยาบาล</dt>
            <dd className="mt-1 text-sm leading-6 text-text-muted">แสดงความสัมพันธ์แม่ข่ายและลูกข่ายโดยตรงแบบอ่านอย่างเดียว</dd>
          </div>
          <div className="border-t border-border py-3">
            <dt className="font-semibold text-text">Dashboard ผลรวมเครือข่าย</dt>
            <dd className="mt-1 text-sm leading-6 text-text-muted">ยังไม่เปิดใช้งาน ระหว่างรอกติกาคุ้มครองข้อมูล เงื่อนไขผู้มีสิทธิ์ และการตีความข้อมูลย้อนหลัง</dd>
          </div>
          <div className="border-t border-border py-3">
            <dt className="font-semibold text-text">ส่งออกข้อมูลเครือข่าย</dt>
            <dd className="mt-1 text-sm leading-6 text-text-muted">ยังไม่ได้รับอนุญาต</dd>
          </div>
        </dl>
      </Panel>
    </section>
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
      ? "Program กำลังดำเนินอยู่"
      : "ยังไม่บันทึกวันที่สิ้นสุด";

  return (
    <dl className="grid min-w-0 gap-x-6 gap-y-3 border-b border-border pb-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="min-w-0"><dt className="text-sm text-text-muted">รหัสผู้ป่วยในโรงพยาบาล</dt><dd className="mt-1 break-words font-medium">{hospitalNumber}</dd></div>
      <div className="min-w-0"><dt className="text-sm text-text-muted">เริ่ม Program</dt><dd className="mt-1 break-words font-medium">{displayDate(program.lifecycle.startedAt)}</dd></div>
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
}): React.JSX.Element {
  return allowed ? (
    <Link
      className={buttonClassName({ variant: "secondary", size: "compact" })}
      href={`/app/patients/${program.patientHospitalRelationshipId}/programs/${program.patientProgramId}/report`}
    >
      เปิดรายละเอียด Program
    </Link>
  ) : (
    <p className="text-right text-xs leading-5 text-text-muted">
      การเปิดรายละเอียด Program ใช้สิทธิ์ Hospital แยกต่างหาก
    </p>
  );
}

function ProgramOverview({
  program,
  allowProgramDetail,
}: {
  program: HospitalReportProgramRow;
  allowProgramDetail: boolean;
}): React.JSX.Element {
  return (
    <Panel aria-labelledby={`overview-program-${program.patientProgramId}`} className="p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-text" id={`overview-program-${program.patientProgramId}`}>{program.patient.displayName}</h3>
        </div>
        <StatusBadge variant={program.lifecycle.status === "ACTIVE" ? "info" : "neutral"}>
          {program.lifecycle.status === "ACTIVE" ? "กำลังดำเนิน Program" : "สิ้นสุด Program แล้ว"}
        </StatusBadge>
      </div>

      <ProgramContext program={program} />

      <div className="grid min-w-0 gap-6 pt-5 lg:grid-cols-3">
        <section aria-labelledby={`before-${program.patientProgramId}`} className="min-w-0">
          <h4 className="mb-3 font-semibold text-text" id={`before-${program.patientProgramId}`}>ก่อนเริ่ม · ข้อมูลตั้งต้น</h4>
          {program.baseline.state === "PRESENT" ? (
            <>
              <p className="mb-3 text-sm text-text-muted">บันทึกวันที่ {displayDate(program.baseline.value.recordedOn)}</p>
              <MeasurementList measurements={program.baseline.value.measurements} />
              <p className="mt-3 text-sm text-text-muted">ส่วนสูง: {factText(program.baseline.value.heightCm)}{program.baseline.value.heightCm.state === "RECORDED" ? " ซม." : ""}</p>
            </>
          ) : <p className="text-sm text-text-muted">ไม่มีข้อมูลตั้งต้นที่เชื่อมกับ Program นี้</p>}
          <ul className="mt-3 space-y-1 text-sm text-text-muted">
            <li>ความเสี่ยงโรคหัวใจและหลอดเลือด (CVD Risk): {unavailableText(program.unavailable.baselineCvdRiskScore)}</li>
            <li>HbA1c: {program.baseline.state === "PRESENT" ? factStatus(program.baseline.value.hba1c) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับ Program นี้"}</li>
            <li>BMI: {unavailableText(program.unavailable.baselineBmi)}</li>
          </ul>
        </section>

        <section aria-labelledby={`during-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h4 className="mb-3 font-semibold text-text" id={`during-${program.patientProgramId}`}>ระหว่าง Program · การติดตามผล</h4>
          {program.followups.items.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีบันทึกติดตามผลใน Program นี้</p> : (
            <ol className="space-y-4">
              {program.followups.items.map((followup) => (
                <li className="min-w-0 border-b border-border pb-4 last:border-b-0" key={followup.id}>
                  <h5 className="font-medium text-text">ครั้งที่ {followup.roundNumber} · บันทึก {displayDateTime(followup.recordedAt)}</h5>
                  <div className="mt-3"><MeasurementList measurements={followup.measurements} /></div>
                </li>
              ))}
            </ol>
          )}
          {program.followups.hasMore ? <p className="mt-2 text-sm text-text-muted">แสดง {program.followups.items.length} จาก {program.followups.totalCount} รายการ · {allowProgramDetail ? "ดูรายละเอียดทั้งหมดได้ที่รายงาน Program" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
          <p className="mt-3 text-sm text-text-muted">คะแนนผลสำเร็จ: {unavailableText(program.unavailable.achievementRate)}</p>
        </section>

        <section aria-labelledby={`after-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h4 className="mb-3 font-semibold text-text" id={`after-${program.patientProgramId}`}>หลัง Program · การประเมินครั้งสุดท้าย</h4>
          {program.finalAssessment.state === "PRESENT" ? (
            <>
              <p className="mb-3 text-sm text-text-muted">วันที่ประเมิน {program.finalAssessment.value.serviceDate ?? "ไม่ได้บันทึก"} · บันทึกวันที่ {displayDateTime(program.finalAssessment.value.recordedAt)}</p>
              <MeasurementList measurements={program.finalAssessment.value.measurements} />
            </>
          ) : <p className="text-sm text-text-muted">ไม่มีการประเมินหลังจบ Program ที่บันทึกไว้</p>}
          <ul className="mt-3 space-y-1 text-sm text-text-muted">
            <li>ความเสี่ยงโรคหัวใจและหลอดเลือด (CVD Risk): {unavailableText(program.unavailable.afterCvdRiskScore)}</li>
            <li>HbA1c: {unavailableText(program.unavailable.afterHba1c)}</li>
            <li>BMI: {unavailableText(program.unavailable.afterBmi)}</li>
            <li>ส่วนสูง: {unavailableText(program.unavailable.afterHeightCm)}</li>
          </ul>
        </section>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-words text-xs text-text-muted">ระยะเวลาที่ป่วย: {unavailableText(program.unavailable.illnessDuration)} · สถานะ Program ไม่ใช่ผลลัพธ์ทางคลินิก</p>
        <ProgramDetailAccess allowed={allowProgramDetail} program={program} />
      </div>
    </Panel>
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
      <h5 className="font-semibold text-text">ครั้งที่ {followup.roundNumber} · บันทึก {displayDateTime(followup.recordedAt)}</h5>
      <p className="mt-1 text-sm text-text-muted">วันที่ให้บริการ: {followup.serviceDate ?? "ไม่ได้บันทึก"}</p>
      <div className="mt-3"><MeasurementList measurements={followup.measurements} /></div>
      <ul className="mt-3 space-y-1 text-sm text-text-muted">
        <li>วันที่ทำได้ / อัตราความสำเร็จ: {achievementText(followup)}</li>
        <li>ปรับแผนใหม่: {answerText(followup.planAdjusted, "ปรับ", "ไม่ปรับ")} · อุปสรรค: {answerText(followup.hasObstacle, "มี", "ไม่มี")}</li>
      </ul>
      <div className="mt-4">
        <h6 className="text-sm font-semibold text-text">ความคืบหน้ากิจกรรมที่บันทึก</h6>
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

function ServiceProgram({
  program,
  allowProgramDetail,
}: {
  program: HospitalReportProgramRow;
  allowProgramDetail: boolean;
}): React.JSX.Element {
  const goalPlans = program.goalPlans.items;
  return (
    <Panel aria-labelledby={`service-program-${program.patientProgramId}`} className="p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-text" id={`service-program-${program.patientProgramId}`}>{program.patient.displayName}</h3></div>
        <StatusBadge variant={program.lifecycle.status === "ACTIVE" ? "info" : "neutral"}>{program.lifecycle.status === "ACTIVE" ? "กำลังดำเนิน Program" : "สิ้นสุด Program แล้ว"}</StatusBadge>
      </div>
      <ProgramContext program={program} />

      <div className="grid min-w-0 gap-6 pt-5 lg:grid-cols-2">
        <section aria-labelledby={`service-before-${program.patientProgramId}`} className="min-w-0">
          <h4 className="mb-3 font-semibold text-text" id={`service-before-${program.patientProgramId}`}>ก่อนเริ่ม · ข้อมูลตั้งต้น</h4>
          {program.baseline.state === "PRESENT" ? <MeasurementList measurements={program.baseline.value.measurements} /> : <p className="text-sm text-text-muted">ไม่มีข้อมูลตั้งต้นที่เชื่อมกับ Program นี้</p>}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>แบบประเมิน PAM / PROMs: {unavailableText(program.unavailable.beforePamScore)} / {unavailableText(program.unavailable.beforePromsScore)}</li>
            <li>คะแนนความมั่นใจ: {program.baseline.state === "PRESENT" ? factStatus(program.baseline.value.confidenceScore) : "ไม่มีข้อมูลตั้งต้นที่เชื่อมกับ Program นี้"}</li>
            <li>เวลาออกกำลังกายต่อสัปดาห์: {unavailableText(program.unavailable.beforeWeeklyExercise)}</li>
          </ul>
          <h4 className="mb-3 mt-6 font-semibold text-text">หลัง Program · ข้อมูลการประเมิน</h4>
          {program.finalAssessment.state === "PRESENT" ? <MeasurementList measurements={program.finalAssessment.value.measurements} /> : <p className="text-sm text-text-muted">ไม่มีการประเมินหลังจบ Program ที่บันทึกไว้</p>}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>เวลาออกกำลังกายต่อสัปดาห์: {unavailableText(program.unavailable.afterWeeklyExercise)}</li>
            <li>จำนวนครั้งที่ผลสำเร็จมากกว่า 70%: {achievementOver70Text(program)}</li>
          </ul>
        </section>

        <section aria-labelledby={`service-one-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h4 className="mb-3 font-semibold text-text" id={`service-one-${program.patientProgramId}`}>บริการ 1 · รู้จักตัวเอง</h4>
          <ServiceOne program={program} />
          <p className="mt-4 text-sm text-text-muted">สถานะนี้แสดงการมีบันทึกในระบบ ไม่ยืนยันการส่งมอบบริการหรือผลการรักษา</p>
        </section>

        <section aria-labelledby={`service-goal-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5">
          <h4 className="mb-3 font-semibold text-text" id={`service-goal-${program.patientProgramId}`}>บริการ 2 · ทำแผนสุขภาพ</h4>
          {goalPlans.length === 0 ? <p className="text-sm text-text-muted">ไม่มีแผนสุขภาพที่ผูกกับ Program นี้</p> : (
            <ol className="space-y-4">
              {goalPlans.map((plan) => (
                <li className="min-w-0 border-b border-border pb-4 last:border-b-0" key={plan.id}>
                  <h5 className="font-medium">แผนรอบที่ {plan.roundNumber}: {plan.primaryGoalLabel}</h5>
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
          {program.goalPlans.hasMore ? <p className="mt-3 text-sm text-text-muted">แสดง {goalPlans.length} จาก {program.goalPlans.totalCount} แผน · {allowProgramDetail ? "เปิดรายละเอียด Program เพื่อดูรายการทั้งหมด" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
          <p className="mt-3 text-sm text-text-muted">ค่าในแผนเป็นเป้าหมายที่บันทึก ไม่ใช่ผลการปฏิบัติ</p>
        </section>

        <section aria-labelledby={`service-followup-${program.patientProgramId}`} className="min-w-0 border-t border-border pt-5">
          <h4 className="mb-3 font-semibold text-text" id={`service-followup-${program.patientProgramId}`}>บริการ 3 เป็นต้นไป · การติดตามผลและความคืบหน้า</h4>
          {program.followups.items.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีบันทึกติดตามผลใน Program นี้</p> : <ol><>{program.followups.items.map((followup) => <ServiceFollowup followup={followup} key={followup.id} />)}</></ol>}
          {program.followups.hasMore ? <p className="mt-3 text-sm text-text-muted">แสดง {program.followups.items.length} จาก {program.followups.totalCount} รายการ · {allowProgramDetail ? "ดูทั้งหมดในรายละเอียด Program หรือไฟล์ Excel" : "ดูรายการทั้งหมดได้ในไฟล์ Excel"}</p> : null}
          <ul className="mt-4 space-y-1 text-sm text-text-muted">
            <li>ผลลัพธ์ที่ได้: {unavailableText(program.unavailable.outcome)}</li>
          </ul>
        </section>
      </div>

      <div className="mt-5 flex justify-end border-t border-border pt-4">
        <ProgramDetailAccess allowed={allowProgramDetail} program={program} />
      </div>
    </Panel>
  );
}

function ExportButton({
  hospitalId,
  endpoint,
}: {
  hospitalId: string;
  endpoint: string;
}): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function download(): Promise<void> {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}?hospitalId=${encodeURIComponent(hospitalId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        let errorMessage = "ส่งออกรายงานไม่สำเร็จ กรุณาลองอีกครั้ง";
        try {
          const payload: unknown = await response.json();
          if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
            errorMessage = payload.error;
          }
        } catch {
          // Use the safe local message when the response body is not JSON.
        }
        setMessage(errorMessage);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "demi-hospital-report.xlsx";
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setMessage("สร้างไฟล์ Excel สำเร็จแล้ว");
    } catch {
      setMessage("เชื่อมต่อเพื่อส่งออกรายงานไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
      <Button onClick={() => void download()} loading={loading} type="button">
        {loading ? "กำลังสร้างไฟล์ Excel" : "ส่งออก Excel"}
      </Button>
      {message ? <p aria-live="polite" className="max-w-sm text-sm text-text-muted" role="status">{message}</p> : null}
    </div>
  );
}

export function HospitalReportWorkspace({
  hospitals,
  hierarchy,
  initialView,
  page,
  selectedHospitalId,
  audience = "HOSPITAL_OWNER",
  parentGroups = [],
  selection,
}: {
  hospitals: readonly HospitalReportingHospital[];
  hierarchy: HospitalHierarchyContext;
  initialView: string;
  page: HospitalReportingPageProjection;
  selectedHospitalId: string;
  audience?: "HOSPITAL_OWNER" | "GLOBAL_ADMIN";
  parentGroups?: readonly ParentChildHospitalReportTargetGroup[];
  selection?: HospitalReportTargetSelection;
}): React.JSX.Element {
  const [view, setView] = useState<ReportView>(initialView === "service" ? "service" : "overview");
  const isGlobalAdmin = audience === "GLOBAL_ADMIN";
  const routeBase = isGlobalAdmin ? "/app/admin/reporting" : "/app/hospitals/reporting";
  const baseHref = `${routeBase}?hospitalId=${encodeURIComponent(selectedHospitalId)}`;
  const allowProgramDetail = !isGlobalAdmin;
  const targetSelection = selection ?? { kind: "DIRECT_OWNER", hospitalId: selectedHospitalId };

  return (
    <div className="min-w-0 max-w-[1440px]">
      <PageHeader
        actions={<ExportButton endpoint={isGlobalAdmin ? "/api/v1/admin/reporting/export" : "/api/v1/hospital/reporting/export"} hospitalId={selectedHospitalId} />}
        breadcrumbs={isGlobalAdmin
          ? [{ label: "หน้าหลัก", href: "/app" }, { label: "รายงานระบบ", href: "/app/admin/reporting" }, { label: "รายงานโรงพยาบาล" }]
          : [{ label: "หน้าหลัก", href: "/app" }, { label: "รายงานโรงพยาบาล" }]}
        description={isGlobalAdmin
          ? "Platform ADMIN → โรงพยาบาลที่เลือก → รายงาน Patient/Program เฉพาะโรงพยาบาลนี้"
          : "ดูข้อมูลผู้ป่วยตาม Program และตรวจว่ามีการบันทึกขั้นตอนบริการใดไว้บ้าง"}
        title="รายงานโรงพยาบาล"
      />

      {isGlobalAdmin ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm leading-6 text-text-muted">
            รายงานนี้ใช้ข้อมูลของ Hospital ที่เลือกเท่านั้น ไม่รวมผู้ป่วยจากโรงพยาบาลแม่ข่าย ลูกข่าย หรือหน่วยอื่น
          </p>
          <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href="/app/admin/reporting" prefetch={false}>
            กลับไปภาพรวมและเลือกโรงพยาบาล
          </Link>
        </div>
      ) : null}

      {isGlobalAdmin ? (
        hospitals.length > 1 ? (
          <form action={routeBase} className="mt-6 flex min-w-0 flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-end" method="get">
            <div className="min-w-0 flex-1">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-report-hospital">เลือกโรงพยาบาลสำหรับรายงานเฉพาะแห่ง</label>
              <select className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2" defaultValue={selectedHospitalId} id="hospital-report-hospital" name="hospitalId">
                {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name} ({hospital.hospitalCode})</option>)}
              </select>
              <input name="view" type="hidden" value={view} />
            </div>
            <Button type="submit" variant="secondary">เปลี่ยนโรงพยาบาล</Button>
          </form>
        ) : null
      ) : (
        <HospitalReportTargetSelector
          hospitals={hospitals}
          parentGroups={parentGroups}
          routeBase={routeBase}
          selection={targetSelection}
          view={view}
        />
      )}

      <HospitalReportingHierarchy hierarchy={hierarchy} />

      <section aria-labelledby="hospital-report-context-heading" className="mt-6">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-text" id="hospital-report-context-heading">{page.hospital.name}</h2>
            <p className="mt-1 break-words text-sm text-text-muted">รหัสโรงพยาบาล {page.hospital.hospitalCode} · {hierarchy.classification === "MAIN" ? "โรงพยาบาลแม่ข่าย" : "โรงพยาบาลลูกข่าย / หน่วยบริการในเครือ"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={hierarchyStatusVariant(hierarchy.hospital.status)}>{hierarchyStatusLabel(hierarchy.hospital.status)}</StatusBadge>
            <p className="text-sm text-text-muted">{isGlobalAdmin ? "รายงาน exact-Hospital ของหน่วยนี้" : "การเข้าถึง: เจ้าของโรงพยาบาลนี้โดยตรง"}</p>
          </div>
        </div>

        <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
            <dt className="text-sm text-text-muted">ความสัมพันธ์ผู้ป่วยกับโรงพยาบาล</dt>
            <dd className="mt-1 text-2xl font-semibold text-text">{page.counts.patientHospitalRelationships.value.toLocaleString("th-TH")}</dd>
            <p className="mt-1 text-xs text-text-muted">นับการเชื่อมโยงผู้ป่วยกับโรงพยาบาล แยกจากจำนวน Program</p>
          </div>
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
            <dt className="text-sm text-text-muted">Program ทั้งหมด</dt>
            <dd className="mt-1 text-2xl font-semibold text-text">{page.counts.programs.total.toLocaleString("th-TH")}</dd>
            <p className="mt-1 text-xs text-text-muted">กำลังดำเนิน {page.counts.programs.active.toLocaleString("th-TH")} · สิ้นสุดแล้ว {page.counts.programs.completed.toLocaleString("th-TH")}</p>
          </div>
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
            <dt className="text-sm text-text-muted">ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program</dt>
            <dd className="mt-1 text-2xl font-semibold text-text">{page.counts.relationshipsWithoutProgram.value.toLocaleString("th-TH")}</dd>
            <p className="mt-1 text-xs text-text-muted">ไม่มีการสร้างรายการ Program ขึ้นเอง</p>
          </div>
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
            <dt className="text-sm text-text-muted">DM / Pre-DM</dt>
            <dd className="mt-1 font-semibold text-text">ยังสรุปไม่ได้</dd>
            <p className="mt-1 text-xs text-text-muted">ไม่มีนิยามและตัวหารที่ได้รับรองสำหรับรายงานนี้</p>
          </div>
        </dl>
      </section>

      <div className="mt-6 max-w-full overflow-x-auto pb-1">
        <LocalNavigation ariaLabel="มุมมองรายงานโรงพยาบาล" items={REPORT_VIEWS} onChange={setView} value={view} />
      </div>

      <section aria-labelledby={view === "overview" ? "overview-heading" : "service-heading"} className="mt-5">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-text" id={view === "overview" ? "overview-heading" : "service-heading"}>
            {view === "overview" ? "Dashboard ภาพรวม" : "รายงานการจัดบริการ"}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
            {view === "overview"
              ? "แต่ละบัตรแสดงข้อมูลหนึ่ง Program ผู้ป่วยคนเดียวอาจมีหลาย Program; ระบบจะแจ้งเมื่อข้อมูลยังไม่ถูกบันทึกหรือไม่มีแหล่งข้อมูลรองรับ"
              : "ตรวจการมีบันทึกของแต่ละบริการ เป้าหมายที่ตั้งไว้ และความคืบหน้าที่บันทึกไว้ โดยการมีบันทึกไม่ยืนยันว่าบริการส่งมอบหรือเกิดผลสำเร็จ"}
          </p>
        </div>

        {view === "service" ? <Alert className="mb-4" variant="info">แผนสุขภาพแสดงเป้าหมายที่บันทึกไว้ ส่วนการติดตามผลแสดงข้อมูลที่มีการบันทึก สถานะเหล่านี้ไม่ใช่คะแนนผลสำเร็จและไม่ได้ยืนยันการส่งมอบบริการหรือผลการรักษา</Alert> : null}

        {page.page.items.length === 0 && page.counts.programs.total === 0 ? (
          <Panel>
            <h3 className="font-semibold text-text">ยังไม่มี Program ที่รายงานได้</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {page.counts.patientHospitalRelationships.value === 0
                ? "ยังไม่มีผู้ป่วยที่เชื่อมกับโรงพยาบาลนี้"
                : `มีความสัมพันธ์ผู้ป่วย ${page.counts.relationshipsWithoutProgram.value.toLocaleString("th-TH")} รายที่ยังไม่มี Program จึงไม่มีรายการ Program ให้แสดง`}
            </p>
          </Panel>
        ) : page.page.items.length === 0 ? (
          <Panel>
            <h3 className="font-semibold text-text">ไม่มี Program ในหน้านี้</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">ยังมี Program {page.counts.programs.total.toLocaleString("th-TH")} รายการในโรงพยาบาลนี้ โปรดกลับไปหน้าแรกของรายงาน</p>
            <Link className={`${buttonClassName({ variant: "secondary" })} mt-4`} href={`${baseHref}&view=${view}`} prefetch={false}>กลับไปหน้าแรก</Link>
          </Panel>
        ) : (
          <div className="grid min-w-0 gap-4">
            {page.page.items.map((program) => view === "overview"
              ? <ProgramOverview allowProgramDetail={allowProgramDetail} key={program.patientProgramId} program={program} />
              : <ServiceProgram allowProgramDetail={allowProgramDetail} key={program.patientProgramId} program={program} />)}
          </div>
        )}
      </section>

      {page.counts.programs.total > 0 ? <p className="mt-4 text-sm text-text-muted">แสดง {page.page.items.length.toLocaleString("th-TH")} รายการในหน้านี้ จากทั้งหมด {page.counts.programs.total.toLocaleString("th-TH")} Program</p> : null}

      {page.page.nextCursor ? (
        <nav aria-label="หน้ารายการ Program ของรายงานโรงพยาบาล" className="mt-5 flex justify-end">
          <Link className={buttonClassName({ variant: "secondary" })} href={`${baseHref}&cursor=${encodeURIComponent(page.page.nextCursor)}&pageSize=${page.page.pageSize}&view=${view}`} prefetch={false} rel="next">ดู Program ถัดไป</Link>
        </nav>
      ) : null}
      <p className="mt-4 text-xs leading-5 text-text-muted">ชื่อ อสม. แสดงเฉพาะผู้ที่ได้รับมอบหมายให้ดูแลผู้ป่วยรายนี้ในปัจจุบัน รายงานนี้ไม่มีข้อมูลผู้ดูแลย้อนหลังของบริการ</p>
    </div>
  );
}
