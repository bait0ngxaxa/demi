import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildPatientRoundsPath,
  buildRoundToolHref,
  formatRoundDate,
  formatRoundNumber,
  ROUND_AWAITING_FORM_LABEL,
  roundActivitySourceLabel,
  roundActivityStatusLabel,
} from "@/modules/patient-program-rounds/presentation/round-labels";
import type {
  ProgramRoundDetail,
  RoundActivityRow,
} from "@/modules/patient-program-rounds/services/round-query-service";

import { RoundReviewButton } from "./round-review-button";
import { RoundVitalsForm } from "./round-vitals-form";

const progressStatusLabels = {
  DONE: "ทำได้",
  PARTIAL: "ทำได้บางส่วน",
  NOT_DONE: "ยังทำไม่ได้",
  NOT_APPLICABLE: "ไม่เกี่ยวข้อง",
} as const;

function MetaLine({ row }: { row: RoundActivityRow }): React.JSX.Element | null {
  if (row.status !== "DONE") {
    return null;
  }

  return (
    <p className="mt-1 text-xs text-text-subtle">
      {formatRoundDate(row.performedAt)} · ผู้บันทึก {row.recordedByDisplayName ?? "ไม่ระบุ"}
    </p>
  );
}

function ActivityActions({
  detail,
  nonce,
  row,
}: {
  detail: ProgramRoundDetail;
  nonce: string;
  row: RoundActivityRow;
}): React.JSX.Element | null {
  const active = detail.programStatus === "ACTIVE";
  const href = buildRoundToolHref({
    row,
    relationshipId: detail.patientHospitalRelationshipId,
    programId: detail.patientProgramId,
    roundNumber: detail.roundNumber,
  });

  if (row.status === "AWAITING_FORM") {
    return <p className="text-sm text-text-muted">{ROUND_AWAITING_FORM_LABEL}</p>;
  }

  if (row.status === "DONE") {
    return href ? (
      <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={href}>
        {row.mode === "REVIEWED" ? "ดูผลเดิม (อ่านอย่างเดียว)" : "ดูผลที่บันทึก"}
      </Link>
    ) : null;
  }

  if (row.canReview) {
    return (
      <div className="flex flex-col gap-2 sm:items-end">
        {href ? (
          <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={href}>
            ดูผลเดิม (อ่านอย่างเดียว)
          </Link>
        ) : null}
        {active ? (
          <RoundReviewButton
            label="บันทึกว่าได้ทบทวนในครั้งนี้"
            patientHospitalRelationshipId={detail.patientHospitalRelationshipId}
            patientProgramId={detail.patientProgramId}
            roundNumber={detail.roundNumber}
            submissionNonce={nonce}
            toolCode={row.toolCode}
          />
        ) : null}
      </div>
    );
  }

  if (row.kind === "FOLLOWUP_REVIEW") {
    return detail.canStartFollowup ? (
      <Link
        className={buttonClassName({ variant: "primary", size: "compact" })}
        href={`/app/patients/${encodeURIComponent(detail.patientHospitalRelationshipId)}/programs/${encodeURIComponent(detail.patientProgramId)}/followups/new`}
      >
        บันทึกการติดตามผล
      </Link>
    ) : (
      <p className="text-sm text-text-muted">
        {detail.roundNumber >= 3
          ? "บันทึกครั้งก่อนหน้าให้ครบก่อน จึงจะบันทึกการติดตามผลครั้งนี้ได้"
          : "บันทึกได้ในครั้งที่ 3–6"}
      </p>
    );
  }

  if (!href || !active) {
    return null;
  }

  const recordsInRoundOne =
    (row.kind === "SCREENING" || row.kind === "SERVICE_ONE") && detail.roundNumber !== 1;

  return (
    <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={href}>
      {recordsInRoundOne ? "ไปบันทึก (นับเป็นครั้งที่ 1)" : row.resultExists ? "ดูผล" : "บันทึก"}
    </Link>
  );
}

function ActivityItem({
  detail,
  nonce,
  row,
}: {
  detail: ProgramRoundDetail;
  nonce: string;
  row: RoundActivityRow;
}): React.JSX.Element {
  const sourceLabel = roundActivitySourceLabel(row);

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-text">{row.label}</p>
          <StatusBadge variant={row.status === "DONE" ? "success" : "neutral"}>
            {roundActivityStatusLabel(row)}
          </StatusBadge>
          {sourceLabel ? <StatusBadge variant="info">{sourceLabel}</StatusBadge> : null}
        </div>
        <MetaLine row={row} />
      </div>
      <div className="shrink-0">
        <ActivityActions detail={detail} nonce={nonce} row={row} />
      </div>
    </li>
  );
}

export function ProgramRoundDetailView({
  detail,
  reviewNonces,
  todayServiceDate,
  vitalsNonce, healthHistory,
}: {
  detail: ProgramRoundDetail;
  reviewNonces: Record<string, string>;
  todayServiceDate: string;
  vitalsNonce: string;
  healthHistory?: React.ReactNode;
}): React.JSX.Element {
  const relationshipId = detail.patientHospitalRelationshipId;
  const programId = detail.patientProgramId;
  const roundsPath = buildPatientRoundsPath(relationshipId, programId);
  const vitals = detail.vitals;

  return (
    <div>
      <PageHeader
        actions={
          <StatusBadge variant={detail.programStatus === "ACTIVE" ? "success" : "neutral"}>
            {detail.programStatus === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว"}
          </StatusBadge>
        }
        breadcrumbs={[
          { href: `/app/patients/${encodeURIComponent(relationshipId)}`, label: "รายละเอียดผู้ป่วย" },
          { href: roundsPath, label: "การจัดบริการครั้งที่ 1–6" },
          { label: detail.title },
        ]}
        description={`ผู้ป่วย: ${detail.patientDisplayName}`}
        title={detail.title}
      />

      <div className="space-y-6 pt-8">
        {detail.programStatus === "COMPLETED" ? (
          <Alert variant="neutral">โปรแกรมนี้จบแล้ว ข้อมูลครั้งนี้เป็นประวัติแบบอ่านอย่างเดียว</Alert>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">สัญญาณชีพและข้อมูลร่างกาย</h2>
          {healthHistory}
          {vitals ? (
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["วันที่ให้บริการ", formatRoundDate(vitals.serviceDate)],
                ["น้ำหนัก (kg)", formatRoundNumber(vitals.weight)],
                ["ส่วนสูง (cm)", formatRoundNumber(vitals.heightCm)],
                ["BMI (kg/m²)", formatRoundNumber(vitals.bmi)],
                ["รอบเอว (cm)", formatRoundNumber(vitals.waistCircumference)],
                ["น้ำตาลในเลือด / DTX (mg/dL)", formatRoundNumber(vitals.bloodSugar)],
                ["ความดันตัวบน (mmHg)", formatRoundNumber(vitals.systolicBloodPressure)],
                ["ความดันตัวล่าง (mmHg)", formatRoundNumber(vitals.diastolicBloodPressure)],
                ["ผู้บันทึก", vitals.recordedByDisplayName ?? "ไม่ระบุ"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-semibold text-text-muted">{label}</dt>
                  <dd className="mt-1 font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>
          ) : detail.vitalsForm.canRecord ? (
            <div className="mt-5">
              <RoundVitalsForm
                heightEditable={detail.vitalsForm.heightEditable}
                latestHeightCm={detail.vitalsForm.latestHeightCm}
                occupation={detail.occupation}
                patientDisplayName={detail.patientDisplayName}
                patientHospitalRelationshipId={relationshipId}
                patientProgramId={programId}
                roundNumber={detail.roundNumber}
                submissionNonce={vitalsNonce}
                todayServiceDate={todayServiceDate}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-text-muted">
              {detail.roundNumber >= 3
                ? "สัญญาณชีพของครั้งนี้บันทึกพร้อมแบบฟอร์มการติดตามผล"
                : "ครั้งนี้ไม่มีสัญญาณชีพที่บันทึกไว้"}
              {detail.vitalsForm.latestHeightCm !== null
                ? ` · ส่วนสูงล่าสุด ${formatRoundNumber(detail.vitalsForm.latestHeightCm)} cm (แสดงอย่างเดียว)`
                : ""}
            </p>
          )}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">รายการแนะนำของครั้งนี้</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เป็นรายการแนะนำ ไม่บังคับทำครบ ครั้งนี้นับว่าบันทึกแล้วเมื่อมีสัญญาณชีพหรือกิจกรรมอย่างน้อย 1 รายการ
          </p>
          <ul className="mt-5 divide-y divide-border">
            {detail.activities.map((row) => (
              <ActivityItem detail={detail} key={row.toolCode} nonce={reviewNonces[row.toolCode] ?? ""} row={row} />
            ))}
          </ul>
        </Panel>

        {detail.dueItems ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
              รายการที่ต้องติดตามในครั้งนี้
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              กิจกรรมจากแผนเป้าหมายที่ใช้ติดตามในครั้งนี้ รายการอื่นเพิ่มได้จากส่วน &ldquo;การจัดบริการเพิ่ม&rdquo;
            </p>
            {detail.dueItems.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">แผนเป้าหมายนี้ไม่มีกิจกรรม</p>
            ) : (
              <ul className="mt-5 divide-y divide-border">
                {detail.dueItems.map((item) => (
                  <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={item.activityCode}>
                    <div>
                      <p className="font-semibold text-text">{item.activityLabel}</p>
                      <p className="text-xs text-text-subtle">
                        เป้าหมาย {item.targetDays} วัน/สัปดาห์
                        {item.targetValue !== null ? ` · ${item.targetValue} ${item.targetUnit ?? ""}` : ""}
                      </p>
                    </div>
                    <StatusBadge variant={item.progressStatus === "DONE" ? "success" : "neutral"}>
                      {item.progressStatus
                        ? `${progressStatusLabels[item.progressStatus]}${item.achievedDays !== null ? ` · ${item.achievedDays}/7 วัน` : ""}`
                        : "รอติดตาม"}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">การจัดบริการเพิ่ม</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เพิ่มเครื่องมืออื่นที่ทำจริงในครั้งนี้ รายการที่เพิ่มจะแสดงในประวัติของครั้งนี้เป็น &ldquo;การจัดบริการเพิ่ม&rdquo;
            เครื่องมือ Service 1 ที่มีผลบันทึกแล้วจะเป็นการทบทวนผลเดิม ไม่สร้างผลใหม่ทับ
          </p>
          <ul className="mt-5 divide-y divide-border">
            {detail.addOptions.map((row) => (
              <ActivityItem detail={detail} key={row.toolCode} nonce={reviewNonces[row.toolCode] ?? ""} row={row} />
            ))}
          </ul>
        </Panel>

        <Link className={buttonClassName({ variant: "secondary" })} href={roundsPath}>
          กลับไปภาพรวมครั้งที่ 1–6
        </Link>
      </div>
    </div>
  );
}
