import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  ScreeningHistory,
  ScreeningHistoryItem,
} from "@/modules/screening/services/screening-query-service";
import {
  SCREENING_LEVEL_LABELS,
  SCREENING_PROTOTYPE_NOTICE_BODY,
  SCREENING_PROTOTYPE_NOTICE_TITLE,
  SCREENING_ZONE_LABELS,
} from "@/modules/screening/presentation/screening-labels";

type ScreeningHistoryViewProps = {
  history: ScreeningHistory;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function zoneVariant(zone: ScreeningHistoryItem["result"]["zone"]): StatusVariant {
  if (zone === "RED") {
    return "danger";
  }

  if (zone === "YELLOW") {
    return "warning";
  }

  return "success";
}

function ScreeningHistoryRow({
  item,
  relationshipId,
}: {
  item: ScreeningHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={`/app/patients/${encodeURIComponent(relationshipId)}/screenings/${encodeURIComponent(item.screeningAssessmentId)}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              {formatDate(item.submittedAt.toISOString())}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              ผู้ทำแบบประเมิน: {item.conductedByDisplayName}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">สถานะ: ส่งแล้ว</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge variant="info">{SCREENING_LEVEL_LABELS[item.result.level]}</StatusBadge>
            <StatusBadge variant={zoneVariant(item.result.zone)}>
              {SCREENING_ZONE_LABELS[item.result.zone]}
            </StatusBadge>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">คะแนนรวม PAM</dt>
            <dd className="mt-1 font-semibold text-text">{item.result.pamTotal}</dd>
          </div>
          <div>
            <dt className="text-text-muted">คะแนนรวม PROMs</dt>
            <dd className="mt-1 font-semibold text-text">{item.result.promsTotal}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function ScreeningHistoryView({ history }: ScreeningHistoryViewProps): React.JSX.Element {
  return (
    <div>
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(history.patient.patientHospitalRelationshipId)}/screenings/new`}
          >
            เริ่มแบบประเมินใหม่
          </Link>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(history.patient.patientHospitalRelationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ประวัติการประเมิน" },
        ]}
        description="ประวัติการประเมินของผู้ป่วยในบริบทของโรงพยาบาลนี้ เรียงจากรายการล่าสุด"
        title="ประวัติการประเมิน"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="info">
          <p className="font-semibold">{SCREENING_PROTOTYPE_NOTICE_TITLE}</p>
          <p className="mt-1">{SCREENING_PROTOTYPE_NOTICE_BODY}</p>
        </Alert>

        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {history.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{history.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {history.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
        </Panel>

        <section aria-labelledby="screening-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="screening-history-heading">
                รายการประเมิน
              </h2>
          <p className="mt-1 text-sm text-text-muted">เรียงจากรายการล่าสุดไปยังรายการก่อนหน้า</p>
            </div>
            <p className="text-sm text-text-muted">ทั้งหมด {history.items.length} รายการ</p>
          </div>

          {history.items.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
              <ul className="divide-y divide-border" aria-label="ประวัติการประเมิน">
                {history.items.map((item) => (
                  <ScreeningHistoryRow
                    item={item}
                    key={item.screeningAssessmentId}
                    relationshipId={history.patient.patientHospitalRelationshipId}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีแบบประเมินสำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                เริ่มรายการแรกเพื่อบันทึกข้อมูลการประเมินของผู้ป่วย
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
