"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS,
  PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
} from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import type {
  PatientOsmAssignmentScope,
  PatientOsmBulkAssignmentView,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  initialPatientOsmBulkAssignmentActionState,
  type PatientOsmBulkAssignmentActionState,
} from "@/modules/patient-assignment/transport/action-state";
import { bulkAssignOsmToPatientsAction } from "@/modules/patient-assignment/transport/server-actions";

type PatientOsmBulkAssignmentWorkspaceProps = {
  scopes: readonly PatientOsmAssignmentScope[];
  selectedScope: PatientOsmAssignmentScope;
  view: PatientOsmBulkAssignmentView | null;
  search: string;
  errorMessage: string | null;
};

export function PatientOsmBulkAssignmentWorkspace({
  scopes,
  selectedScope,
  view,
  search,
  errorMessage,
}: PatientOsmBulkAssignmentWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientOsmBulkAssignmentActionState, FormData>(
    bulkAssignOsmToPatientsAction,
    initialPatientOsmBulkAssignmentActionState,
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [osmUserId, setOsmUserId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submissionNonce, setSubmissionNonce] = useState("");
  const patients = view?.patients ?? [];
  const osmCandidates = view?.osmCandidates ?? [];
  const selectedOsm = osmCandidates.find((candidate) => candidate.userId === osmUserId) ?? null;
  const allSelected = patients.length > 0 && selectedIds.size === patients.length;
  const succeeded = state.status === "SUCCESS";
  const selectedPatients = patients.filter((patient) =>
    selectedIds.has(patient.patientHospitalRelationshipId),
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.refresh();
    }
  }, [router, state]);

  function toggleAll(checked: boolean): void {
    setSelectedIds(
      checked ? new Set(patients.map((patient) => patient.patientHospitalRelationshipId)) : new Set(),
    );
  }

  function togglePatient(relationshipId: string, checked: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(relationshipId);
      } else {
        next.delete(relationshipId);
      }

      return next;
    });
  }

  function startConfirmation(): void {
    // One nonce per confirmation: a repeated submit of the same confirmation is replayed, not re-applied.
    setSubmissionNonce(crypto.randomUUID());
    setConfirming(true);
  }

  function editSelection(): void {
    if (!pending) {
      setConfirming(false);
    }
  }

  const canConfirm = selectedPatients.length > 0 && selectedOsm !== null;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">เจ้าของโรงพยาบาล</StatusBadge>}
        breadcrumbs={[
          { label: "รายชื่อผู้ป่วย", href: `/app/patients?hospitalId=${encodeURIComponent(selectedScope.hospitalId)}` },
          { label: "กำหนด อสม. หลายคน" },
        ]}
        description="เลือกผู้ป่วยที่ยังไม่มี อสม. ผู้รับผิดชอบ แล้วกำหนด อสม. คนเดียวให้ทั้งหมดในครั้งเดียว การเปลี่ยน อสม. ของผู้ป่วยที่มีอยู่แล้วทำได้ทีละคน"
        title="กำหนด อสม. ให้ผู้ป่วยหลายคน"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <p className="text-sm font-semibold text-text-muted">โรงพยาบาลที่ดำเนินการ</p>
          {scopes.length > 1 ? (
            <form className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
              <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold sm:min-w-80">
                <span className="sr-only">เลือกโรงพยาบาล</span>
                <Select defaultValue={selectedScope.hospitalId} name="hospitalId">
                  {scopes.map((scope) => (
                    <option key={scope.hospitalId} value={scope.hospitalId}>
                      {scope.hospitalName}
                    </option>
                  ))}
                </Select>
              </label>
              <Button size="compact" type="submit" variant="secondary">
                เลือกโรงพยาบาล
              </Button>
            </form>
          ) : (
            <p className="mt-2 text-lg font-semibold text-brand-strong">{selectedScope.hospitalName}</p>
          )}
        </Panel>

        {succeeded ? (
          <Alert variant="success">
            <p className="font-semibold">
              {state.result.operation === "REPLAYED"
                ? "คำขอนี้ถูกบันทึกไปแล้ว ระบบไม่มอบหมายซ้ำ"
                : "กำหนด อสม. เรียบร้อยแล้ว"}
            </p>
            <p className="mt-1">กำหนด อสม. ให้ผู้ป่วย {state.result.assignedCount} คน</p>
            <Link
              className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={`/app/patients?hospitalId=${encodeURIComponent(selectedScope.hospitalId)}`}
            >
              กลับไปรายชื่อผู้ป่วย
            </Link>
          </Alert>
        ) : null}

        {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

        {view && !succeeded ? (
          <>
            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ผู้ป่วยที่ยังไม่มี อสม.</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                พบ {view.totalWithoutOsm} คน
                {view.totalWithoutOsm > patients.length
                  ? ` · แสดง ${patients.length} คนแรก (เลือกได้ไม่เกิน ${PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS} คนต่อครั้ง)`
                  : ""}
              </p>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
                <input name="hospitalId" type="hidden" value={selectedScope.hospitalId} />
                <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold">
                  <span>ค้นหาชื่อผู้ป่วย</span>
                  <Input
                    defaultValue={search}
                    disabled={confirming}
                    maxLength={PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH}
                    name="value"
                    type="search"
                  />
                </label>
                <Button disabled={confirming} size="compact" type="submit" variant="secondary">
                  ค้นหา
                </Button>
              </form>

              {patients.length === 0 ? (
                <p className="mt-5 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
                  ผู้ป่วยทุกคนในโรงพยาบาลนี้มี อสม. ผู้รับผิดชอบแล้ว
                </p>
              ) : (
                <div className="mt-5 overflow-hidden rounded-panel border border-border bg-surface">
                  <label className="flex items-center gap-3 border-b border-border bg-canvas px-4 py-3 text-sm font-semibold">
                    <input
                      checked={allSelected}
                      className="size-4 accent-brand-strong"
                      disabled={confirming || pending}
                      onChange={(event) => toggleAll(event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>เลือกทั้งหมดที่แสดง ({patients.length})</span>
                  </label>
                  <ul aria-label="ผู้ป่วยที่ยังไม่มี อสม." className="divide-y divide-border">
                    {patients.map((patient) => (
                      <li key={patient.patientHospitalRelationshipId}>
                        <label className="flex items-center gap-3 px-4 py-3 text-sm">
                          <input
                            checked={selectedIds.has(patient.patientHospitalRelationshipId)}
                            className="size-4 accent-brand-strong"
                            disabled={confirming || pending}
                            onChange={(event) =>
                              togglePatient(
                                patient.patientHospitalRelationshipId,
                                event.currentTarget.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1 break-words font-semibold text-text">
                            {patient.displayName}
                          </span>
                          <span className="shrink-0 text-text-muted">
                            HN {patient.hospitalNumber ?? "ไม่ระบุ"}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <Panel>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เลือก อสม.</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                แสดงเฉพาะบัญชี อสม. ที่เปิดใช้งานและมีความสัมพันธ์กับโรงพยาบาลนี้
              </p>
              {osmCandidates.length > 0 ? (
                <label className="mt-4 block max-w-xl space-y-2 text-sm font-semibold">
                  <span>อสม. ที่ต้องการมอบหมาย</span>
                  <Select
                    disabled={confirming || pending}
                    onChange={(event) => setOsmUserId(event.target.value)}
                    value={osmUserId}
                  >
                    <option disabled value="">
                      เลือก อสม.
                    </option>
                    {osmCandidates.map((candidate) => (
                      <option key={candidate.userId} value={candidate.userId}>
                        {candidate.displayName}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <p className="mt-4 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
                  ไม่พบ อสม. ที่เปิดใช้งานในโรงพยาบาลนี้
                </p>
              )}

              {!confirming ? (
                <Button
                  className="mt-5"
                  disabled={!canConfirm}
                  onClick={startConfirmation}
                  type="button"
                >
                  {selectedPatients.length > 0
                    ? `ตรวจสอบก่อนมอบหมาย (${selectedPatients.length} คน)`
                    : "ตรวจสอบก่อนมอบหมาย"}
                </Button>
              ) : null}
            </Panel>

            {confirming && selectedOsm ? (
              <Panel>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">ยืนยันการมอบหมาย</h2>
                <p className="mt-2 text-sm leading-6 text-text">
                  กำหนด <span className="font-semibold">{selectedOsm.displayName}</span> เป็น อสม.
                  ผู้รับผิดชอบของผู้ป่วย{" "}
                  <span className="font-semibold">{selectedPatients.length} คน</span>
                </p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  หากรายการใดไม่ผ่านการตรวจสอบ ระบบจะไม่บันทึกรายการใดเลย
                </p>
                <form action={action} className="mt-5 flex flex-wrap items-center gap-3">
                  <input name="hospitalId" type="hidden" value={selectedScope.hospitalId} />
                  <input name="osmUserId" type="hidden" value={selectedOsm.userId} />
                  <input name="submissionNonce" type="hidden" value={submissionNonce} />
                  {selectedPatients.map((patient) => (
                    <input
                      key={patient.patientHospitalRelationshipId}
                      name="patientHospitalRelationshipId"
                      type="hidden"
                      value={patient.patientHospitalRelationshipId}
                    />
                  ))}
                  <Button disabled={pending} loading={pending} type="submit">
                    {pending ? "กำลังบันทึก..." : "ยืนยันมอบหมาย"}
                  </Button>
                  <Button disabled={pending} onClick={editSelection} type="button" variant="secondary">
                    กลับไปแก้ไข
                  </Button>
                </form>
                {state.status === "ERROR" ? (
                  <Alert className="mt-4" variant="danger">
                    <p className="font-semibold">ดำเนินการไม่สำเร็จ</p>
                    <p className="mt-1">{state.message}</p>
                  </Alert>
                ) : null}
              </Panel>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
