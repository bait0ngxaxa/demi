"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  HospitalContactEditorProjection,
  HospitalContactOwnerHospital,
} from "@/modules/hospital-contact/types/hospital-contact-projections";
import type {
  HospitalContactMutationActionState,
  HospitalContactReadActionState,
} from "@/modules/hospital-contact/transport/action-state";
import {
  readHospitalContactForOwnerAction,
  updateHospitalContactAction,
} from "@/modules/hospital-contact/transport/server-actions";

type ContactDraft = {
  addressText: string;
  phoneNumber: string;
};

function toDraft(contact: HospitalContactEditorProjection): ContactDraft {
  return {
    addressText: contact.addressText ?? "",
    phoneNumber: contact.phoneNumber ?? "",
  };
}

function completeness(contact: HospitalContactEditorProjection): {
  label: string;
  variant: "success" | "warning" | "neutral";
} {
  const hasAddress = contact.addressText !== null;
  const hasPhone = contact.phoneNumber !== null;

  if (hasAddress && hasPhone) {
    return { label: "มีที่อยู่และหมายเลขโทรศัพท์", variant: "success" };
  }

  if (hasAddress || hasPhone) {
    return { label: "มีข้อมูลติดต่อบางส่วน", variant: "warning" };
  }

  return { label: "ยังไม่มีข้อมูลติดต่อ", variant: "neutral" };
}

function valuesMatchDraft(contact: HospitalContactEditorProjection, draft: ContactDraft): boolean {
  return (
    (contact.addressText ?? "") === draft.addressText &&
    (contact.phoneNumber ?? "") === draft.phoneNumber
  );
}

export function HospitalContactWorkspace({
  hospitals,
  selectedHospitalId,
  contact: initialContact,
}: {
  hospitals: readonly HospitalContactOwnerHospital[];
  selectedHospitalId: string;
  contact: HospitalContactEditorProjection;
}): React.JSX.Element {
  const router = useRouter();
  const [current, setCurrent] = useState(initialContact);
  const [draft, setDraft] = useState(() => toDraft(initialContact));
  const [mutationState, setMutationState] = useState<HospitalContactMutationActionState>({
    status: "IDLE",
  });
  const [readState, setReadState] = useState<HospitalContactReadActionState | null>(null);
  const [reviewCurrent, setReviewCurrent] = useState<HospitalContactEditorProjection | null>(null);
  const [previousDraft, setPreviousDraft] = useState<ContactDraft | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isDirty = !valuesMatchDraft(current, draft);
  const status = completeness(current);

  function switchHospital(nextHospitalId: string, select: HTMLSelectElement): void {
    if (!nextHospitalId || nextHospitalId === selectedHospitalId || isPending) {
      select.value = selectedHospitalId;
      return;
    }

    if (isDirty && !window.confirm("มีแบบร่างที่ยังไม่ได้บันทึก ต้องการเปลี่ยนโรงพยาบาลและทิ้งแบบร่างนี้หรือไม่")) {
      select.value = selectedHospitalId;
      return;
    }

    router.push(`/app/hospitals/contact?hospitalId=${encodeURIComponent(nextHospitalId)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (accessRevoked || reconciliationRequired || isPending) {
      return;
    }

    setMutationState({ status: "IDLE" });
    setReadState(null);

    startTransition(async () => {
      try {
        const result = await updateHospitalContactAction({
          hospitalId: selectedHospitalId,
          expectedUpdatedAt: current.expectedUpdatedAt,
          addressText: draft.addressText === "" ? null : draft.addressText,
          phoneNumber: draft.phoneNumber === "" ? null : draft.phoneNumber,
        });

        setMutationState(result);

        if (result.status === "SUCCESS") {
          setCurrent(result.result.contact);
          setDraft(toDraft(result.result.contact));
          setPreviousDraft(null);
          setReviewCurrent(null);
          setReconciliationRequired(false);
        } else if (result.status === "UNCONFIRMED") {
          setPreviousDraft(draft);
          setReviewCurrent(null);
          setReconciliationRequired(true);
        } else if (result.status === "ERROR" && result.code === "CONFLICT") {
          setPreviousDraft(draft);
          setReviewCurrent(null);
          setReconciliationRequired(true);
        } else if (result.status === "ERROR" && result.code === "FORBIDDEN") {
          setAccessRevoked(true);
          setCurrent((value) => ({
            ...value,
            addressText: null,
            phoneNumber: null,
            expectedUpdatedAt: null,
          }));
          setDraft({ addressText: "", phoneNumber: "" });
          setPreviousDraft(null);
          setReviewCurrent(null);
        }
      } catch {
        setPreviousDraft(draft);
        setReviewCurrent(null);
        setReconciliationRequired(true);
        setMutationState({ status: "UNCONFIRMED" });
      }
    });
  }

  function loadCurrentContact(): void {
    setReadState(null);
    startTransition(async () => {
      try {
        const result = await readHospitalContactForOwnerAction(selectedHospitalId);
        setReadState(result);

        if (result.status === "SUCCESS") {
          setReviewCurrent(result.contact);
        } else if (result.status === "FORBIDDEN") {
          setAccessRevoked(true);
          setCurrent((value) => ({
            ...value,
            addressText: null,
            phoneNumber: null,
            expectedUpdatedAt: null,
          }));
          setDraft({ addressText: "", phoneNumber: "" });
          setPreviousDraft(null);
          setReviewCurrent(null);
        }
      } catch {
        setReadState({ status: "UNAVAILABLE" });
      }
    });
  }

  function beginFromCurrent(): void {
    if (!reviewCurrent) {
      return;
    }

    setCurrent(reviewCurrent);
    setDraft(toDraft(reviewCurrent));
    setReconciliationRequired(false);
    setMutationState({ status: "IDLE" });
    setReadState(null);
    setReviewCurrent(null);
  }

  if (accessRevoked) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "ข้อมูลติดต่อโรงพยาบาล" }]}
          description="จัดการข้อมูลติดต่อของโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง"
          title="ข้อมูลติดต่อโรงพยาบาล"
        />
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ไม่สามารถแสดงข้อมูลของโรงพยาบาลนี้ได้</p>
          <p className="mt-1">สิทธิ์อาจเปลี่ยนแปลงแล้ว กรุณาเปิดหน้านี้ใหม่เพื่อตรวจสอบอีกครั้ง</p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "ข้อมูลติดต่อโรงพยาบาล" }]}
        description="ปรับปรุงข้อมูลติดต่อที่โรงพยาบาลให้ไว้สำหรับผู้ป่วย"
        title="ข้อมูลติดต่อโรงพยาบาล"
      />

      {hospitals.length > 1 ? (
        <div className="mt-6 max-w-xl">
          <label className="type-label mb-2 block text-text" htmlFor="hospital-contact-hospital">
            เลือกโรงพยาบาล
          </label>
          <select
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            disabled={isPending}
            id="hospital-contact-hospital"
            onChange={(event) => switchHospital(event.currentTarget.value, event.currentTarget)}
            value={selectedHospitalId}
          >
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {hospital.name} ({hospital.hospitalCode})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {mutationState.status === "SUCCESS" ? (
        <Alert className="mt-6" variant="success">
          {mutationState.result.outcome === "CREATED"
            ? "บันทึกข้อมูลติดต่อแล้ว"
            : mutationState.result.outcome === "UPDATED"
              ? "ปรับปรุงข้อมูลติดต่อแล้ว"
              : "ข้อมูลติดต่อเป็นปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง"}
        </Alert>
      ) : null}

      {mutationState.status === "ERROR" ? (
        <Alert className="mt-6" variant={mutationState.code === "VALIDATION" ? "warning" : "danger"}>
          <p className="font-semibold">{mutationState.message}</p>
        </Alert>
      ) : null}

      {mutationState.status === "UNCONFIRMED" ? (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ยังยืนยันผลการบันทึกไม่ได้</p>
          <p className="mt-1">โหลดข้อมูลปัจจุบันและตรวจสอบก่อนเริ่มบันทึกใหม่ ระบบจะไม่ส่งคำขอเดิมซ้ำให้อัตโนมัติ</p>
        </Alert>
      ) : null}

      {reconciliationRequired ? (
        <Panel aria-labelledby="contact-reconciliation-heading" className="mt-4">
          <h2 className="text-base font-semibold text-text" id="contact-reconciliation-heading">
            ตรวจสอบข้อมูลล่าสุดก่อนบันทึกอีกครั้ง
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-text-muted">
            แบบร่างเดิมยังเก็บไว้ในหน้านี้ กรุณาโหลดข้อมูลปัจจุบันและพิจารณาความแตกต่างด้วยตนเอง
          </p>
          <Button className="mt-4" disabled={isPending} onClick={loadCurrentContact} type="button" variant="secondary">
            {isPending ? "กำลังโหลดข้อมูล..." : "โหลดข้อมูลปัจจุบัน"}
          </Button>

          {readState?.status === "UNAVAILABLE" ? (
            <Alert className="mt-4" variant="danger">
              <p className="font-semibold">โหลดข้อมูลปัจจุบันไม่สำเร็จ</p>
              <p className="mt-1">แบบร่างยังไม่ได้เปลี่ยนแปลง กรุณาลองโหลดอีกครั้ง</p>
            </Alert>
          ) : null}

          {reviewCurrent ? (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-semibold text-text">ข้อมูลปัจจุบันจากโรงพยาบาล</h3>
              <dl className="mt-3 grid min-w-0 gap-4 text-sm">
                <div className="min-w-0">
                  <dt className="text-text-muted">ที่อยู่</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-text">
                    {reviewCurrent.addressText ?? "ไม่มีข้อมูล"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-text-muted">หมายเลขโทรศัพท์</dt>
                  <dd className="mt-1 break-words text-text">{reviewCurrent.phoneNumber ?? "ไม่มีข้อมูล"}</dd>
                </div>
              </dl>
              <Button className="mt-4" disabled={isPending} onClick={beginFromCurrent} type="button" variant="secondary">
                เริ่มแก้ไขจากข้อมูลปัจจุบัน
              </Button>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                แบบร่างเดิมยังแสดงด้านล่างเพื่อใช้ตรวจเทียบ ระบบจะไม่รวมข้อมูลหรือบันทึกซ้ำให้อัตโนมัติ
              </p>
            </div>
          ) : null}

          {previousDraft ? (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-semibold text-text">แบบร่างเดิมที่ยังไม่ได้ยืนยัน</h3>
              <dl className="mt-3 grid min-w-0 gap-4 text-sm">
                <div className="min-w-0">
                  <dt className="text-text-muted">ที่อยู่</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-text">
                    {previousDraft.addressText || "ไม่มีข้อมูล"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-text-muted">หมายเลขโทรศัพท์</dt>
                  <dd className="mt-1 break-words text-text">{previousDraft.phoneNumber || "ไม่มีข้อมูล"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {!reconciliationRequired && previousDraft ? (
        <Panel aria-labelledby="hospital-contact-previous-draft-heading" className="mt-4">
          <h2 className="font-semibold text-text" id="hospital-contact-previous-draft-heading">
            แบบร่างเดิมที่ยังไม่ได้ยืนยัน
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            ใช้ข้อมูลนี้ตรวจเทียบและแก้ไขในแบบฟอร์มด้วยตนเอง
          </p>
          <dl className="mt-3 grid min-w-0 gap-4 text-sm">
            <div className="min-w-0">
              <dt className="text-text-muted">ที่อยู่</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-text">
                {previousDraft.addressText || "ไม่มีข้อมูล"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-text-muted">หมายเลขโทรศัพท์</dt>
              <dd className="mt-1 break-words text-text">{previousDraft.phoneNumber || "ไม่มีข้อมูล"}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {!reconciliationRequired ? (
        <Panel aria-labelledby="hospital-contact-form-heading" className="mt-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold text-text" id="hospital-contact-form-heading">
                {current.hospital.name}
              </h2>
              <p className="mt-1 break-words text-sm text-text-muted">
                รหัสโรงพยาบาล {current.hospital.hospitalCode}
              </p>
            </div>
            <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
          </div>

          <p className="mt-4 text-sm leading-6 text-text-muted">ข้อมูลติดต่อที่โรงพยาบาลให้ไว้</p>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-contact-address">
                ที่อยู่
              </label>
              <textarea
                aria-describedby="hospital-contact-address-description hospital-contact-address-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.addressText)}
                className="type-control min-h-32 w-full max-w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-contact-address"
                onChange={(event) => setDraft((value) => ({ ...value, addressText: event.currentTarget.value }))}
                value={draft.addressText}
              />
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-contact-address-description">
                ระบุที่อยู่เป็นข้อความธรรมดา สามารถขึ้นบรรทัดใหม่และเว้นวรรคตามต้องการ
              </p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-contact-address-error">
                {mutationState.status === "ERROR" ? mutationState.fieldErrors?.addressText ?? "" : ""}
              </p>
            </div>

            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-contact-phone">
                หมายเลขโทรศัพท์
              </label>
              <input
                aria-describedby="hospital-contact-phone-description hospital-contact-phone-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.phoneNumber)}
                className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-contact-phone"
                onChange={(event) => setDraft((value) => ({ ...value, phoneNumber: event.currentTarget.value }))}
                type="text"
                value={draft.phoneNumber}
              />
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-contact-phone-description">
                กรอกหมายเลขและข้อความต่อสายที่ต้องการแสดง ผู้ป่วยจะเห็นเป็นข้อความ
              </p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-contact-phone-error">
                {mutationState.status === "ERROR" ? mutationState.fieldErrors?.phoneNumber ?? "" : ""}
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-text-muted">
                เว้นช่องว่างเพื่อล้างข้อมูลได้ ทั้งสองช่องเป็นข้อมูลไม่บังคับ
              </p>
              <Button disabled={!isDirty || isPending || reconciliationRequired} loading={isPending} type="submit">
                {isPending ? "กำลังบันทึก..." : "บันทึกข้อมูลติดต่อ"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {mutationState.status === "ERROR" && mutationState.code === "UNAVAILABLE" ? (
        <Alert className="mt-4" variant="danger">
          <p className="font-semibold">บันทึกข้อมูลติดต่อไม่สำเร็จ</p>
          <p className="mt-1">ข้อมูลที่กรอกยังอยู่ในแบบร่าง กรุณาลองอีกครั้งภายหลัง</p>
        </Alert>
      ) : null}
    </div>
  );
}
