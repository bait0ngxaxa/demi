"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedBulkAssignment extends Error {}

/** How many selected patients the review lists by name before summarizing the rest as a count. */
const REVIEW_PATIENT_PREVIEW_LIMIT = 8;

/**
 * The exact assignment intent captured when the review opens. The submitted payload comes only
 * from this snapshot, so a background list update can never change what is being confirmed.
 */
type AssignmentReview = {
  hospitalId: string;
  hospitalName: string;
  osm: PatientOsmCandidate;
  patients: readonly { relationshipId: string; displayName: string; hospitalNumber: string | null }[];
  submissionNonce: string;
};

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
                      {candidate.displayName}{candidate.contactPhone ? ` · ${candidate.contactPhone}` : ""}
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
  const activeHospitalId = useRef(selectedScope.hospitalId);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    activeHospitalId.current = selectedScope.hospitalId;
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [selectedScope.hospitalId]);

  // The payload of an unconfirmed request, including its submissionNonce, is kept by the hook
  // and re-sent unchanged; nothing here generates a new nonce.
  const assignAndNotify = async (
    previous: PatientOsmBulkAssignmentActionState,
    formData: FormData,
  ): Promise<PatientOsmBulkAssignmentActionState> => {
    const submittedHospitalId = formData.get("hospitalId");
    try {
      const result = await bulkAssignOsmToPatientsAction(previous, formData);

      if (result.status === "IDLE" || (result.status === "ERROR" && result.code === "UNAVAILABLE")) {
        throw new UnconfirmedBulkAssignment();
      }
      if (
        result.status === "SUCCESS" &&
        ((result.result.operation !== "ASSIGNED" && result.result.operation !== "REPLAYED") ||
          result.result.hospitalId !== submittedHospitalId ||
          result.result.osmUserId !== formData.get("osmUserId") ||
          result.result.assignedCount !== formData.getAll("patientHospitalRelationshipId").length)
      ) {
        throw new UnconfirmedBulkAssignment();
      }

      if (!mounted.current || activeHospitalId.current !== submittedHospitalId) {
        return result;
      }
      if (result.status === "SUCCESS") {
        // REPLAYED means the first request already applied; the inline result explains it.
        if (result.result.operation === "ASSIGNED") {
          notify.success("มอบหมาย อสม. ให้ผู้ป่วยแล้ว");
        }
        router.refresh();
      } else if (result.code === "CONFLICT") {
        notify.warning("ไม่สามารถมอบหมายได้ ระบบไม่บันทึกรายการใด กรุณาตรวจสอบข้อมูลล่าสุด");
      } else if (result.code === "FORBIDDEN") {
        notify.error("ไม่มีสิทธิ์มอบหมาย อสม. ในโรงพยาบาลนี้");
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  };

  const [state, dispatchAssign, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientOsmBulkAssignmentActionState, FormData>(
    assignAndNotify,
    initialPatientOsmBulkAssignmentActionState,
  );
  function action(formData: FormData): void {
    // An unconfirmed request is recovered only by resend; a stale review must be reviewed again.
    if (inFlight.current || unknownOutcome || reviewStale) {
      return;
    }
    inFlight.current = true;
    dispatchAssign(formData);
  }
  function resend(): void {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    resendUnconfirmed();
  }
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedOsm, setSelectedOsm] = useState<PatientOsmCandidate | null>(null);
  const [review, setReview] = useState<AssignmentReview | null>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const returnToEdit = useRef<HTMLButtonElement>(null);
  const osmHeading = useRef<HTMLHeadingElement>(null);
  const resultFeedback = useRef<HTMLDivElement>(null);
  const confirming = review !== null;
  const patients = view?.patients ?? [];
  const allSelected = patients.length > 0 && selectedIds.size === patients.length;
  const succeeded = state.status === "SUCCESS";
  const selectedPatients = patients.filter((patient) =>
    selectedIds.has(patient.patientHospitalRelationshipId),
  );

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
    if (!selectedOsm || selectedPatients.length === 0 || pending || unknownOutcome) {
      return;
    }
    // One nonce per confirmation: a repeated submit of the same confirmation is replayed, not re-applied.
    setReview({
      hospitalId: selectedScope.hospitalId,
      hospitalName: selectedScope.hospitalName,
      osm: selectedOsm,
      patients: selectedPatients.map((patient) => ({
        relationshipId: patient.patientHospitalRelationshipId,
        displayName: patient.displayName,
        hospitalNumber: patient.hospitalNumber,
      })),
      submissionNonce: crypto.randomUUID(),
    });
  }

  function editSelection(): void {
    // Going back would drop the unconfirmed request's recovery and its nonce.
    if (!pending && !unknownOutcome) {
      setReview(null);
    }
  }

  const canConfirm = selectedPatients.length > 0 && selectedOsm !== null;
  const visiblePatientIds = new Set(patients.map((patient) => patient.patientHospitalRelationshipId));
  // The authoritative list changed under the review: confirming would mix old and new context.
  const reviewStale = review !== null && (
    review.hospitalId !== selectedScope.hospitalId ||
    review.patients.some((patient) => !visiblePatientIds.has(patient.relationshipId))
  );
  const reviewOpen = review !== null && !succeeded;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">เจ้าหน้าที่โรงพยาบาล</StatusBadge>}
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
            <Form action="" className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold sm:min-w-80">
                <span className="sr-only">เลือกโรงพยาบาล</span>
                <Select defaultValue={selectedScope.hospitalId} disabled={pending || unknownOutcome} key={selectedScope.hospitalId} name="hospitalId">
                  {scopes.map((scope) => (
                    <option key={scope.hospitalId} value={scope.hospitalId}>
                      {scope.hospitalName}
                    </option>
                  ))}
                </Select>
              </label>
              <PendingSubmitButton disabled={pending || unknownOutcome} size="compact" variant="secondary" pendingLabel="กำลังเปลี่ยนโรงพยาบาล...">
                เลือกโรงพยาบาล
              </PendingSubmitButton>
            </Form>
          ) : (
            <p className="mt-2 text-lg font-semibold text-brand-strong">{selectedScope.hospitalName}</p>
          )}
        </Panel>

        <div className="focus-visible:outline-none" ref={resultFeedback} tabIndex={-1}>
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
        </div>

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
              <Form action="" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <input name="hospitalId" type="hidden" value={selectedScope.hospitalId} />
                <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold">
                  <span>ค้นหาชื่อผู้ป่วย</span>
                  <Input
                    defaultValue={search}
                    disabled={confirming}
                    key={search}
                    maxLength={PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH}
                    name="value"
                    type="search"
                  />
                </label>
                <PendingSubmitButton disabled={confirming} size="compact" variant="secondary" pendingLabel="กำลังค้นหา...">
                  ค้นหา
                </PendingSubmitButton>
              </Form>

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
              <h2 className="text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none" ref={osmHeading} tabIndex={-1}>เลือก อสม.</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                แสดงเฉพาะบัญชี อสม. ที่เปิดใช้งานและมีความสัมพันธ์กับโรงพยาบาลนี้
              </p>
              <OsmSearchPicker
                disabled={confirming || pending}
                hospitalId={selectedScope.hospitalId}
                onSelect={setSelectedOsm}
                selected={selectedOsm}
              />

              <Button
                className="mt-5"
                disabled={!canConfirm || pending || unknownOutcome}
                onClick={startConfirmation}
                ref={reviewTrigger}
                type="button"
              >
                {selectedPatients.length > 0
                  ? `ตรวจสอบก่อนมอบหมาย (${selectedPatients.length} คน)`
                  : "ตรวจสอบก่อนมอบหมาย"}
              </Button>
            </Panel>

            {reviewOpen && review ? (
              <ModalDialog
                description="ตรวจสอบโรงพยาบาล อสม. และผู้ป่วยที่เลือกก่อนยืนยัน"
                dismissible={!pending && !unknownOutcome}
                footer={
                  <form action={action} className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <input name="hospitalId" type="hidden" value={review.hospitalId} />
                    <input name="osmUserId" type="hidden" value={review.osm.userId} />
                    <input name="submissionNonce" type="hidden" value={review.submissionNonce} />
                    {review.patients.map((patient) => (
                      <input
                        key={patient.relationshipId}
                        name="patientHospitalRelationshipId"
                        type="hidden"
                        value={patient.relationshipId}
                      />
                    ))}
                    <Button
                      className="w-full sm:w-auto"
                      disabled={pending || unknownOutcome}
                      onClick={editSelection}
                      ref={returnToEdit}
                      type="button"
                      variant="secondary"
                    >
                      กลับไปแก้ไข
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={unknownOutcome || reviewStale}
                      loading={pending}
                      type="submit"
                    >
                      {pending ? "กำลังบันทึก..." : "ยืนยันมอบหมาย"}
                    </Button>
                  </form>
                }
                initialFocusRef={returnToEdit}
                onRequestClose={editSelection}
                returnFocusTarget={() => {
                  if (!reviewTrigger.current?.isConnected) {
                    return resultFeedback.current?.isConnected ? resultFeedback.current : osmHeading.current;
                  }
                  return reviewTrigger.current.disabled ? osmHeading.current : reviewTrigger.current;
                }}
                title="ยืนยันการมอบหมาย อสม."
              >
                <div className="space-y-5">
                  <dl className="grid gap-4 rounded-panel bg-surface-muted px-4 py-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm text-text-muted">โรงพยาบาล</dt>
                      <dd className="mt-1 break-words font-semibold text-text">{review.hospitalName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">อสม. ผู้รับผิดชอบ</dt>
                      <dd className="mt-1 break-words font-semibold text-text">{review.osm.displayName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">จำนวนผู้ป่วย</dt>
                      <dd className="mt-1 font-semibold text-text">{review.patients.length} คน</dd>
                    </div>
                  </dl>
                  <p className="text-sm leading-6 text-text">
                    กำหนด <span className="font-semibold">{review.osm.displayName}</span> เป็น อสม.
                    ผู้รับผิดชอบของผู้ป่วย{" "}
                    <span className="font-semibold">{review.patients.length} คน</span>
                  </p>
                  <Alert variant="info">
                    การมอบหมายครั้งนี้ทำพร้อมกันทั้งหมด หากรายการใดไม่ผ่านการตรวจสอบ ระบบจะไม่บันทึกรายการใดเลย
                  </Alert>
                  <section aria-label="ผู้ป่วยที่จะได้รับการมอบหมาย" className="space-y-2">
                    <h3 className="text-sm font-semibold text-text">ผู้ป่วยที่เลือก</h3>
                    <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border">
                      {review.patients.slice(0, REVIEW_PATIENT_PREVIEW_LIMIT).map((patient) => (
                        <li className="flex items-center gap-3 px-4 py-2.5 text-sm" key={patient.relationshipId}>
                          <span className="min-w-0 flex-1 break-words font-semibold text-text">{patient.displayName}</span>
                          <span className="shrink-0 text-text-muted">HN {patient.hospitalNumber ?? "ไม่ระบุ"}</span>
                        </li>
                      ))}
                    </ul>
                    {review.patients.length > REVIEW_PATIENT_PREVIEW_LIMIT ? (
                      <p className="text-sm text-text-muted">
                        และอีก {review.patients.length - REVIEW_PATIENT_PREVIEW_LIMIT} คนที่เลือกไว้ในรายการบนหน้า
                      </p>
                    ) : null}
                  </section>
                  {reviewStale && !unknownOutcome ? (
                    <Alert role="alert" variant="warning">
                      รายชื่อผู้ป่วยหรือโรงพยาบาลเปลี่ยนไปหลังเปิดหน้าตรวจสอบ กรุณากลับไปแก้ไขแล้วตรวจสอบใหม่ก่อนมอบหมาย
                    </Alert>
                  ) : null}
                  {state.status === "ERROR" ? (
                    <Alert variant="danger">
                      <p className="font-semibold">ดำเนินการไม่สำเร็จ</p>
                      <p className="mt-1">{state.message}</p>
                    </Alert>
                  ) : null}
                  <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resend, resending: pending }} />
                </div>
              </ModalDialog>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
