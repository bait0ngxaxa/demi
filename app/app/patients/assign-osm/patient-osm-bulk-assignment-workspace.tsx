"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS,
  PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
} from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import type {
  PatientOsmAssignmentScope,
  PatientOsmBulkAssignmentView,
  PatientOsmCandidate,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  initialPatientOsmBulkAssignmentActionState,
  type PatientOsmBulkAssignmentActionState,
  type PatientOsmBulkCandidateSearchResult,
} from "@/modules/patient-assignment/transport/action-state";
import {
  bulkAssignOsmToPatientsAction,
  searchPatientOsmBulkCandidatesAction,
} from "@/modules/patient-assignment/transport/server-actions";

import {
  appendPage,
  createLatestRequestGate,
  listFromFirstPage,
  OSM_SEARCH_ERROR,
  osmCandidateListKey,
  type OsmCandidateList,
} from "./osm-candidate-paging";

const OSM_SEARCH_DEBOUNCE_MS = 300;

type OsmSearchPickerProps = {
  hospitalId: string;
  selected: PatientOsmCandidate | null;
  disabled: boolean;
  onSelect: (candidate: PatientOsmCandidate | null) => void;
};

/**
 * Server-side, paginated OSM search. A new hospital or search term discards the list
 * and the cursor; a response that is no longer current is ignored. The chosen OSM
 * lives in the parent so it survives paging and searching within the hospital.
 */
function OsmSearchPicker({
  hospitalId,
  selected,
  disabled,
  onSelect,
}: OsmSearchPickerProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [list, setList] = useState<OsmCandidateList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [requestGate] = useState(createLatestRequestGate);
  const trimmedQuery = query.trim();
  const key = osmCandidateListKey(hospitalId, trimmedQuery);
  const loading = list === null || list.key !== key;
  const current = loading ? null : list;

  useEffect(() => {
    const requestId = requestGate.start();
    const timer = setTimeout(
      () => {
        searchPatientOsmBulkCandidatesAction(hospitalId, trimmedQuery)
          .catch(
            (): PatientOsmBulkCandidateSearchResult => ({ status: "ERROR", message: OSM_SEARCH_ERROR }),
          )
          .then((result) => {
            if (!requestGate.isCurrent(requestId)) {
              return;
            }

            setLoadingMore(false);
            setList(listFromFirstPage(key, result));
          });
      },
      trimmedQuery === "" ? 0 : OSM_SEARCH_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [hospitalId, key, requestGate, retryTick, trimmedQuery]);

  function loadMore(): void {
    if (!current || !current.nextCursor || loadingMore) {
      return;
    }

    const requestId = requestGate.start();
    setLoadingMore(true);
    searchPatientOsmBulkCandidatesAction(hospitalId, trimmedQuery, current.nextCursor)
      .catch(
        (): PatientOsmBulkCandidateSearchResult => ({ status: "ERROR", message: OSM_SEARCH_ERROR }),
      )
      .then((result) => {
        if (!requestGate.isCurrent(requestId)) {
          return;
        }

        setLoadingMore(false);
        setList((previous) => appendPage(previous, key, result));
      });
  }

  return (
    <div className="mt-4 max-w-xl space-y-3">
      <p aria-live="polite" className="text-sm" role="status">
        {selected ? (
          <>
            อสม. ที่เลือก: <span className="font-semibold">{selected.displayName}</span>
            <button
              className="ml-3 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:opacity-50"
              disabled={disabled}
              onClick={() => onSelect(null)}
              type="button"
            >
              ล้างการเลือก
            </button>
          </>
        ) : (
          <span className="text-text-muted">ยังไม่ได้เลือก อสม.</span>
        )}
      </p>
      <label className="block space-y-2 text-sm font-semibold">
        <span>ค้นหาชื่อ อสม.</span>
        <Input
          disabled={disabled}
          maxLength={PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          value={query}
        />
      </label>
      <div aria-busy={loading || loadingMore}>
        {!current ? (
          <p className="text-sm text-text-muted" role="status">
            กำลังค้นหา อสม....
          </p>
        ) : current.candidates.length === 0 && current.error ? (
          <Alert variant="danger">
            <p>{current.error}</p>
            <Button
              className="mt-3"
              onClick={() => {
                setList(null);
                setRetryTick((tick) => tick + 1);
              }}
              size="compact"
              type="button"
              variant="secondary"
            >
              ลองอีกครั้ง
            </Button>
          </Alert>
        ) : current.candidates.length === 0 ? (
          <p className="rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
            {trimmedQuery === ""
              ? "ไม่พบ อสม. ที่เปิดใช้งานในโรงพยาบาลนี้"
              : "ไม่พบ อสม. ที่ตรงกับคำค้นหา"}
          </p>
        ) : (
          <>
            <ul
              aria-label="ผลการค้นหา อสม."
              className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface"
              role="radiogroup"
            >
              {current.candidates.map((candidate) => (
                <li key={candidate.userId}>
                  <label className="flex items-center gap-3 px-4 py-3 text-sm">
                    <input
                      checked={selected?.userId === candidate.userId}
                      className="size-4 accent-brand-strong"
                      disabled={disabled}
                      name="osm-candidate"
                      onChange={() => onSelect(candidate)}
                      type="radio"
                    />
                    <span className="min-w-0 flex-1 break-words font-semibold text-text">
                      {candidate.displayName}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {current.error ? (
              <Alert className="mt-2" variant="danger">
                {current.error}
              </Alert>
            ) : null}
            {current.hasMore ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button
                  disabled={disabled || loadingMore}
                  loading={loadingMore}
                  onClick={loadMore}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  {loadingMore ? "กำลังโหลด..." : current.error ? "ลองโหลดเพิ่มเติมอีกครั้ง" : "โหลดเพิ่มเติม"}
                </Button>
                <span className="text-sm text-text-muted">แสดง {current.candidates.length} รายการ</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

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
  const [state, action, pending, unknownOutcome] = useMutationActionState<PatientOsmBulkAssignmentActionState, FormData>(
    bulkAssignOsmToPatientsAction,
    initialPatientOsmBulkAssignmentActionState,
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedOsm, setSelectedOsm] = useState<PatientOsmCandidate | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submissionNonce, setSubmissionNonce] = useState("");
  const patients = view?.patients ?? [];
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
              <OsmSearchPicker
                disabled={confirming || pending}
                hospitalId={selectedScope.hospitalId}
                onSelect={setSelectedOsm}
                selected={selectedOsm}
              />

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
                  <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
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
                <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" />
              </Panel>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
