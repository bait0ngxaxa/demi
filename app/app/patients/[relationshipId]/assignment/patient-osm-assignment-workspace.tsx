"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientDirectoryItem } from "@/modules/patient-directory/services/patient-directory-query-service";
import { PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH } from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import {
  assignOsmToPatientAction,
  unassignOsmFromPatientAction,
} from "@/modules/patient-assignment/transport/server-actions";
import {
  initialPatientOsmAssignmentActionState,
  type PatientOsmAssignmentActionState,
} from "@/modules/patient-assignment/transport/action-state";
import type { PatientOsmCandidate } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";

type PatientOsmAssignmentSummary = {
  assignmentId: string;
  osmUserId: string;
  osmDisplayName: string;
  assignedAt: string;
};

type PatientOsmAssignmentWorkspaceProps = {
  relationshipId: string;
  patient: PatientDirectoryItem;
  currentAssignment: PatientOsmAssignmentSummary | null;
  candidates: PatientOsmCandidate[];
  candidateSearch: string;
  candidateError: string | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function resultMessage(result: PatientOsmAssignmentActionState): string | null {
  if (result.status !== "SUCCESS") {
    return null;
  }

  if (result.result.operation === "NOOP") {
    return "การมอบหมายนี้เป็นสถานะปัจจุบันอยู่แล้ว ระบบไม่สร้างรายการซ้ำ";
  }

  if (result.result.operation === "ASSIGNED") {
    return "มอบหมายผู้ป่วยให้ อสม. เรียบร้อยแล้ว";
  }

  if (result.result.operation === "REASSIGNED") {
    return "เปลี่ยนผู้รับผิดชอบผู้ป่วยเรียบร้อยแล้ว และเก็บประวัติเดิมไว้";
  }

  return "ยกเลิกการมอบหมายผู้ป่วยเรียบร้อยแล้ว";
}

function AssignmentFeedback({
  assignState,
  unassignState,
}: {
  assignState: PatientOsmAssignmentActionState;
  unassignState: PatientOsmAssignmentActionState;
}): React.JSX.Element | null {
  const error = assignState.status === "ERROR" ? assignState : unassignState.status === "ERROR" ? unassignState : null;
  const success = resultMessage(assignState) ?? resultMessage(unassignState);

  if (error) {
    return (
      <Alert className="mt-5" variant="danger">
        <p className="font-semibold">ดำเนินการไม่สำเร็จ</p>
        <p className="mt-1">{error.message}</p>
      </Alert>
    );
  }

  return success ? (
    <Alert className="mt-5" variant="success">
      {success}
    </Alert>
  ) : null;
}

export function PatientOsmAssignmentWorkspace({
  relationshipId,
  patient,
  currentAssignment,
  candidates,
  candidateSearch,
  candidateError,
}: PatientOsmAssignmentWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [assignState, assignAction, assignPending] = useActionState<
    PatientOsmAssignmentActionState,
    FormData
  >(assignOsmToPatientAction, initialPatientOsmAssignmentActionState);
  const [unassignState, unassignAction, unassignPending] = useActionState<
    PatientOsmAssignmentActionState,
    FormData
  >(unassignOsmFromPatientAction, initialPatientOsmAssignmentActionState);

  useEffect(() => {
    if (assignState.status === "SUCCESS" || unassignState.status === "SUCCESS") {
      router.refresh();
    }
  }, [assignState, router, unassignState]);

  const busy = assignPending || unassignPending;

  return (
    <div className="max-w-4xl">
      <PageHeader
        actions={<StatusBadge variant="info">เจ้าของโรงพยาบาล</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "จัดการผู้รับผิดชอบ" },
        ]}
        description="กำหนด อสม. ผู้รับผิดชอบผู้ป่วยในบริบทของโรงพยาบาลนี้ โดยไม่เปลี่ยนข้อมูลผู้ป่วย"
        title="จัดการผู้รับผิดชอบผู้ป่วย"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">{patient.displayName}</h2>
          <dl className="mt-6 divide-y divide-border border-y border-border">
            <div className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold text-text-muted">HN ของโรงพยาบาลนี้</dt>
              <dd className="font-semibold text-text">{patient.hospitalNumber ?? "ไม่ระบุ"}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold text-text-muted">โรงพยาบาล</dt>
              <dd className="font-semibold text-text">{patient.hospital.name}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">การมอบหมายปัจจุบัน</h2>
          {currentAssignment ? (
            <div className="mt-4 rounded-control border border-success/20 bg-success-soft px-4 py-4">
              <p className="font-semibold text-text">{currentAssignment.osmDisplayName}</p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                เริ่มมอบหมายเมื่อ {formatDate(currentAssignment.assignedAt)}
              </p>
              <form action={unassignAction} className="mt-4">
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <Button disabled={busy} size="compact" type="submit" variant="danger">
                  {unassignPending ? "กำลังยกเลิก..." : "ยกเลิกการมอบหมาย"}
                </Button>
              </form>
            </div>
          ) : (
            <p className="mt-4 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
              ผู้ป่วยรายนี้ยังไม่มี อสม. ผู้รับผิดชอบ
            </p>
          )}

          <AssignmentFeedback assignState={assignState} unassignState={unassignState} />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">เลือก อสม. ผู้รับผิดชอบ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            แสดงเฉพาะบัญชี อสม. ที่เปิดใช้งานและมีความสัมพันธ์กับโรงพยาบาลนี้
          </p>
          <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
            <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold">
              <span>ค้นหาชื่อ อสม.</span>
              <Input
                defaultValue={candidateSearch}
                maxLength={PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH}
                name="value"
                placeholder="เช่น สมใจ"
                type="search"
              />
            </label>
            <Button size="compact" type="submit" variant="secondary">
              ค้นหา อสม.
            </Button>
          </form>
          {candidateError ? (
            <Alert className="mt-4" variant="danger">
              {candidateError}
            </Alert>
          ) : null}

          {candidates.length > 0 ? (
            <form action={assignAction} className="mt-5 space-y-4">
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
              <label className="block space-y-2 text-sm font-semibold">
                <span>อสม. ที่ต้องการมอบหมาย</span>
                <Select defaultValue={currentAssignment?.osmUserId ?? ""} name="osmUserId" required>
                  <option disabled value="">
                    เลือก อสม.
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.displayName}
                    </option>
                  ))}
                </Select>
              </label>
              <Button disabled={busy} type="submit">
                {assignPending
                  ? "กำลังบันทึก..."
                  : currentAssignment
                    ? "เปลี่ยนผู้รับผิดชอบ"
                    : "มอบหมายผู้รับผิดชอบ"}
              </Button>
            </form>
          ) : (
            <p className="mt-5 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
              ไม่พบ อสม. ที่เปิดใช้งานในโรงพยาบาลนี้
            </p>
          )}
        </Panel>

        <Link
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={`/app/patients/${encodeURIComponent(relationshipId)}`}
        >
          กลับไปยังรายละเอียดผู้ป่วย
        </Link>
      </div>
    </div>
  );
}
