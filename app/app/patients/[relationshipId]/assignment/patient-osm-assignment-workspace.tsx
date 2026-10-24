"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedAssignment extends Error {}

const assignmentToasts = {
  ASSIGNED: "มอบหมาย อสม. แล้ว",
  REASSIGNED: "เปลี่ยน อสม. ผู้รับผิดชอบแล้ว",
  UNASSIGNED: "ยกเลิกการมอบหมาย อสม. แล้ว",
} as const;

type PatientOsmAssignmentSummary = {
  assignmentId: string;
  osmUserId: string;
  osmDisplayName: string;
  contactPhone: string | null;
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

// Only the latest submitted operation is shown, so an earlier result cannot sit beside a newer one.
function AssignmentFeedback({ state }: { state: PatientOsmAssignmentActionState }): React.JSX.Element | null {
  const error = state.status === "ERROR" ? state : null;
  const success = resultMessage(state);

  if (error) {
    return (
      <Alert className="mt-5" variant="danger">
        <p className="font-semibold">ดำเนินการไม่สำเร็จ</p>
        <p className="mt-1">{error.message}</p>
      </Alert>
    );
  }

  // Changes are announced by their Toast; NOOP has no Toast and stays a live status.
  return success ? (
    <Alert className="mt-5" role={state.status === "SUCCESS" && state.result.operation === "NOOP" ? "status" : "none"} variant="success">
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
  const activeRelationshipId = useRef(relationshipId);
  const mounted = useRef(true);
  // One lock for assign and unassign: they change the same assignment and must never race.
  const inFlight = useRef(false);

  useEffect(() => {
    activeRelationshipId.current = relationshipId;
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [relationshipId]);

  // Results are classified and announced here, once per awaited submission, from the
  // operation the service reports rather than from the button that was pressed.
  const runAssignment = (
    action: (state: PatientOsmAssignmentActionState, formData: FormData) => Promise<PatientOsmAssignmentActionState>,
    allowed: readonly string[],
  ) => async (
    previous: PatientOsmAssignmentActionState,
    formData: FormData,
  ): Promise<PatientOsmAssignmentActionState> => {
    const submittedRelationshipId = formData.get("patientHospitalRelationshipId");
    const submittedOsmUserId = formData.get("osmUserId");
    try {
      const result = await action(previous, formData);

      if (result.status === "IDLE" || (result.status === "ERROR" && result.code === "UNAVAILABLE")) {
        throw new UnconfirmedAssignment();
      }
      if (
        result.status === "SUCCESS" &&
        (!allowed.includes(result.result.operation) ||
          result.result.patientHospitalRelationshipId !== submittedRelationshipId ||
          (submittedOsmUserId !== null && result.result.operation !== "NOOP" && result.result.osmUserId !== submittedOsmUserId))
      ) {
        throw new UnconfirmedAssignment();
      }

      if (!mounted.current || activeRelationshipId.current !== submittedRelationshipId) {
        return result;
      }
      if (result.status === "SUCCESS") {
        if (result.result.operation !== "NOOP") {
          notify.success(assignmentToasts[result.result.operation]);
        }
        router.refresh();
      } else if (result.code === "CONFLICT") {
        notify.warning("ข้อมูลการมอบหมายเปลี่ยนแปลง กรุณาตรวจสอบข้อมูลล่าสุด");
        router.refresh();
      } else if (result.code === "FORBIDDEN") {
        notify.error("ไม่มีสิทธิ์จัดการการมอบหมายผู้ป่วย");
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  };

  const [assignState, dispatchAssign, assignPending, assignUnknown] = useMutationActionState<
    PatientOsmAssignmentActionState,
    FormData
  >(runAssignment(assignOsmToPatientAction, ["ASSIGNED", "REASSIGNED", "NOOP"]), initialPatientOsmAssignmentActionState);
  const [unassignState, dispatchUnassign, unassignPending, unassignUnknown] = useMutationActionState<
    PatientOsmAssignmentActionState,
    FormData
  >(runAssignment(unassignOsmFromPatientAction, ["UNASSIGNED", "NOOP"]), initialPatientOsmAssignmentActionState);
  const [latestOperation, setLatestOperation] = useState<"assign" | "unassign">("assign");
  function guarded(operation: "assign" | "unassign", dispatch: (formData: FormData) => void): (formData: FormData) => void {
    return (formData) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setLatestOperation(operation);
      dispatch(formData);
    };
  }
  const assignAction = guarded("assign", dispatchAssign);
  const unassignAction = guarded("unassign", dispatchUnassign);

  const busy = assignPending || unassignPending || assignUnknown || unassignUnknown;
  // A pending or unconfirmed request keeps the previous submission's retained state, and `latestOperation`
  // only commits when the request's transition ends, so inline feedback waits until no request is open.

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
              <p className="mt-1 text-sm text-muted">เบอร์ติดต่อ: {currentAssignment.contactPhone ?? "ยังไม่ได้ระบุ"}</p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                เริ่มมอบหมายเมื่อ {formatDate(currentAssignment.assignedAt)}
              </p>
              <form action={unassignAction} className="mt-4">
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <Button disabled={busy} loading={unassignPending} size="compact" type="submit" variant="danger">
                  {unassignPending ? "กำลังยกเลิก..." : "ยกเลิกการมอบหมาย"}
                </Button>
              </form>
            </div>
          ) : (
            <p className="mt-4 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
              ผู้ป่วยรายนี้ยังไม่มี อสม. ผู้รับผิดชอบ
            </p>
          )}

          {!busy ? <AssignmentFeedback state={latestOperation === "assign" ? assignState : unassignState} /> : null}
          <UnknownOutcomeAlert active={assignUnknown || unassignUnknown} className="mt-5" recovery={{ kind: "reload" }} />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">เลือก อสม. ผู้รับผิดชอบ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            แสดงเฉพาะบัญชี อสม. ที่เปิดใช้งานและมีความสัมพันธ์กับโรงพยาบาลนี้
          </p>
          <Form action="" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold">
              <span>ค้นหาชื่อ อสม.</span>
              <Input
                defaultValue={candidateSearch}
                key={candidateSearch}
                maxLength={PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH}
                name="value"
                placeholder="เช่น สมใจ"
                type="search"
              />
            </label>
            <PendingSubmitButton size="compact" variant="secondary" pendingLabel="กำลังค้นหา...">
              ค้นหา อสม.
            </PendingSubmitButton>
          </Form>
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
                      {candidate.displayName}{candidate.contactPhone ? ` · ${candidate.contactPhone}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <Button disabled={busy} loading={assignPending} type="submit">
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
