"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AssigneeSearchPicker, type AssigneeOption } from "@/components/assignee/assignee-search-picker";
import type { ServerSearchPageResult } from "@/components/search/server-search-paging";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { PageNumberPagination } from "@/components/ui/page-number-pagination";
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
import type { PatientDirectoryItem } from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  initialPatientOsmBulkAssignmentActionState,
  type PatientOsmBulkAssignmentActionState,
} from "@/modules/patient-assignment/transport/action-state";
import {
  bulkAssignOsmToPatientsAction,
  searchPatientOsmBulkCandidatesAction,
} from "@/modules/patient-assignment/transport/server-actions";

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedBulkAssignment extends Error {}

/** How many selected patients the review lists by name before summarizing the rest as a count. */
const REVIEW_PATIENT_PREVIEW_LIMIT = 8;

/** A chosen patient, kept by relationship id so the choice survives paging and searching. */
type SelectedPatient = { relationshipId: string; displayName: string; hospitalNumber: string | null };

/**
 * The exact assignment intent captured when the review opens. The submitted payload comes only
 * from this snapshot, so a background list update can never change what is being confirmed.
 */
type AssignmentReview = {
  hospitalId: string;
  hospitalName: string;
  osm: PatientOsmCandidate;
  patients: readonly SelectedPatient[];
  submissionNonce: string;
};

function toSelectedPatient(patient: PatientDirectoryItem): SelectedPatient {
  return {
    relationshipId: patient.patientHospitalRelationshipId,
    displayName: patient.displayName,
    hospitalNumber: patient.hospitalNumber,
  };
}

function bulkAssignmentPageHref(hospitalId: string, search: string, page: number): string {
  const params = new URLSearchParams({ hospitalId });

  if (search) {
    params.set("value", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/app/patients/assign-osm?${params.toString()}`;
}

function toOsmOption(candidate: PatientOsmCandidate): AssigneeOption {
  return { id: candidate.userId, displayName: candidate.displayName, detail: candidate.contactPhone };
}

function fromOsmOption(option: AssigneeOption): PatientOsmCandidate {
  return { userId: option.id, displayName: option.displayName, contactPhone: option.detail ?? null };
}

/** The bulk page's OSM search: the shared picker over the Hospital's eligible อสม., one page of 10 at a time. */
async function searchBulkOsmCandidates(
  hospitalId: string,
  query: string,
  page: number,
): Promise<ServerSearchPageResult<AssigneeOption>> {
  const result = await searchPatientOsmBulkCandidatesAction(hospitalId, query, page);
  if (result.status === "ERROR") {
    return result;
  }

  const { candidates, ...position } = result;
  return { ...position, items: candidates.map(toOsmOption) };
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

  // The selection spans pages and searches of one Hospital; the page remounts this workspace
  // for another Hospital, which starts with an empty selection.
  const [selection, setSelection] = useState<ReadonlyMap<string, SelectedPatient>>(() => new Map());
  const [review, setReview] = useState<AssignmentReview | null>(null);
  /** Why patients just left the selection; shown until the owner opens a new review. */
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

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
        setSelection(new Map());
        router.refresh();
      } else if (result.code === "CONFLICT") {
        // The server rejected the whole batch. Named patients leave the selection; everyone else
        // stays selected. No request is pending here, so closing the review drops nothing.
        const unavailable = result.unavailableRelationshipIds ?? [];

        if (unavailable.length > 0) {
          setSelection((current) => {
            const next = new Map(current);
            for (const relationshipId of unavailable) {
              next.delete(relationshipId);
            }
            return next;
          });
          setReview(null);
          setSelectionNotice(result.message);
        }
        // The current page then drops patients that now have an OSM.
        router.refresh();
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
  const [selectedOsm, setSelectedOsm] = useState<PatientOsmCandidate | null>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const returnToEdit = useRef<HTMLButtonElement>(null);
  const osmHeading = useRef<HTMLHeadingElement>(null);
  const resultFeedback = useRef<HTMLDivElement>(null);
  const confirming = review !== null;
  const pagePatients = view?.patients ?? [];
  const succeeded = state.status === "SUCCESS";
  const selectedPatients = [...selection.values()];
  const selectedCount = selection.size;
  const atSelectionCap = selectedCount >= PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS;
  const pageSelectedCount = pagePatients.filter((patient) =>
    selection.has(patient.patientHospitalRelationshipId),
  ).length;
  const allPageSelected = pagePatients.length > 0 && pageSelectedCount === pagePatients.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
  const selectionLocked = confirming || pending;

  function togglePage(checked: boolean): void {
    setSelection((current) => {
      const next = new Map(current);

      for (const patient of pagePatients) {
        const relationshipId = patient.patientHospitalRelationshipId;

        if (!checked) {
          next.delete(relationshipId);
        } else if (!next.has(relationshipId) && next.size < PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS) {
          next.set(relationshipId, toSelectedPatient(patient));
        }
      }

      return next;
    });
  }

  function togglePatient(patient: PatientDirectoryItem, checked: boolean): void {
    setSelection((current) => {
      const relationshipId = patient.patientHospitalRelationshipId;

      if (
        checked === current.has(relationshipId) ||
        (checked && current.size >= PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS)
      ) {
        return current;
      }

      const next = new Map(current);

      if (checked) {
        next.set(relationshipId, toSelectedPatient(patient));
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
    setSelectionNotice(null);
    setReview({
      hospitalId: selectedScope.hospitalId,
      hospitalName: selectedScope.hospitalName,
      osm: selectedOsm,
      patients: selectedPatients,
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
  // The selection spans pages, so only another Hospital invalidates a review. The server
  // re-validates every patient and rejects the whole batch if one already has an OSM.
  const reviewStale = review !== null && review.hospitalId !== selectedScope.hospitalId;
  const reviewOpen = review !== null && !succeeded;

  return (
    <div className="max-w-6xl">
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
            {/* Mobile stacks patients, then the OSM picker; the review bar sticks above the bottom navigation.
                From lg the picker and the review button stay beside the patient list. */}
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start">
              <Panel>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">ผู้ป่วยที่ยังไม่มี อสม.</h2>
                <p className="mt-2 text-sm leading-6 text-text-muted">พบ {view.totalWithoutOsm} คน</p>
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

                {selectionNotice ? (
                  <Alert className="mt-5" role="alert" variant="warning">
                    {selectionNotice}
                  </Alert>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <p aria-live="polite" className="font-semibold text-text" role="status">
                    เลือกแล้ว {selectedCount} คน
                  </p>
                  <button
                    aria-label="ล้างการเลือกผู้ป่วย"
                    className="font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:opacity-50"
                    disabled={selectedCount === 0 || selectionLocked}
                    onClick={() => setSelection(new Map())}
                    type="button"
                  >
                    ล้างการเลือก
                  </button>
                  {atSelectionCap || view.totalWithoutOsm > PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS ? (
                    <p className={atSelectionCap ? "w-full font-semibold text-warning" : "w-full text-text-muted"}>
                      เลือกได้ไม่เกิน {PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS} คนต่อครั้ง
                    </p>
                  ) : null}
                </div>

                {pagePatients.length === 0 ? (
                  <p className="mt-4 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
                    ผู้ป่วยทุกคนในโรงพยาบาลนี้มี อสม. ผู้รับผิดชอบแล้ว
                  </p>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
                    <label className="flex items-center gap-3 border-b border-border bg-canvas px-4 py-3 text-sm font-semibold">
                      <input
                        checked={allPageSelected}
                        className="size-4 accent-brand-strong"
                        disabled={selectionLocked || (atSelectionCap && !allPageSelected)}
                        onChange={(event) => togglePage(event.currentTarget.checked)}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = somePageSelected;
                          }
                        }}
                        type="checkbox"
                      />
                      <span>เลือกทั้งหมดในหน้านี้ ({pagePatients.length})</span>
                    </label>
                    <ul aria-label="ผู้ป่วยที่ยังไม่มี อสม." className="divide-y divide-border">
                      {pagePatients.map((patient) => {
                        const checked = selection.has(patient.patientHospitalRelationshipId);

                        return (
                          <li key={patient.patientHospitalRelationshipId}>
                            <label className="flex items-center gap-3 px-4 py-3 text-sm">
                              <input
                                checked={checked}
                                className="size-4 accent-brand-strong"
                                disabled={selectionLocked || (atSelectionCap && !checked)}
                                onChange={(event) => togglePatient(patient, event.currentTarget.checked)}
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
                        );
                      })}
                    </ul>
                  </div>
                )}

                <PageNumberPagination
                  getPageTarget={(page) => ({ href: bulkAssignmentPageHref(selectedScope.hospitalId, search, page) })}
                  className="mt-5 border-t border-border pt-5"
                  label="หน้ารายชื่อผู้ป่วยที่ยังไม่มี อสม."
                  next={
                    view.hasNextPage
                      ? { href: bulkAssignmentPageHref(selectedScope.hospitalId, search, view.page + 1) }
                      : null
                  }
                  page={view.page}
                  previous={
                    view.hasPreviousPage
                      ? { href: bulkAssignmentPageHref(selectedScope.hospitalId, search, view.page - 1) }
                      : null
                  }
                  totalPages={view.totalPages}
                />
              </Panel>

              {/* `contents` below lg lets the review bar stick within the whole stacked column. */}
              <div className="contents lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:space-y-6 lg:self-start lg:overflow-y-auto">
                <Panel>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none" ref={osmHeading} tabIndex={-1}>เลือก อสม.</h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    แสดงเฉพาะ อสม. ที่เปิดใช้งานและมีสิทธิ์ทำงานกับโรงพยาบาลนี้
                  </p>
                  <AssigneeSearchPicker
                    disabled={selectionLocked}
                    hospitalId={selectedScope.hospitalId}
                    onSelect={(option) => setSelectedOsm(option ? fromOsmOption(option) : null)}
                    search={(query, page) => searchBulkOsmCandidates(selectedScope.hospitalId, query, page)}
                    selected={selectedOsm ? toOsmOption(selectedOsm) : null}
                    variant="osm"
                  />
                </Panel>

                <div className="sticky bottom-[var(--app-mobile-bottom-navigation-content-inset)] z-20 rounded-panel border border-border bg-surface px-4 py-3 shadow-surface lg:static lg:px-5 lg:py-5 lg:shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-3 lg:block">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-text">เลือกแล้ว {selectedCount} คน</p>
                      <p className="truncate text-text-muted">
                        {selectedOsm ? `อสม. ${selectedOsm.displayName}` : "ยังไม่ได้เลือก อสม."}
                      </p>
                    </div>
                    <Button
                      className="shrink-0 lg:mt-4 lg:w-full"
                      disabled={!canConfirm || pending || unknownOutcome}
                      onClick={startConfirmation}
                      ref={reviewTrigger}
                      type="button"
                    >
                      {selectedPatients.length > 0
                        ? `ตรวจสอบก่อนมอบหมาย (${selectedPatients.length} คน)`
                        : "ตรวจสอบก่อนมอบหมาย"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

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
                        และอีก {review.patients.length - REVIEW_PATIENT_PREVIEW_LIMIT} คนที่เลือกไว้
                      </p>
                    ) : null}
                  </section>
                  {reviewStale && !unknownOutcome ? (
                    <Alert role="alert" variant="warning">
                      โรงพยาบาลเปลี่ยนไปหลังเปิดหน้าตรวจสอบ กรุณากลับไปแก้ไขแล้วตรวจสอบใหม่ก่อนมอบหมาย
                    </Alert>
                  ) : null}
                  {/* Unavailable patients were already dropped and explained beside the selection. */}
                  {state.status === "ERROR" && !state.unavailableRelationshipIds?.length ? (
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
