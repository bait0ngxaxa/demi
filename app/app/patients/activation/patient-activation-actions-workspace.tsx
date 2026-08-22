"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientActivationScope } from "@/modules/patient-activation/services/patient-activation-query-service";
import {
  PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH,
  PATIENT_ACTIVATION_NAME_MAX_LENGTH,
} from "@/modules/patient-activation/schemas/patient-activation-schemas";
import {
  findPatientActivationCandidatesAction,
} from "@/modules/patient-activation/transport/server-actions";
import {
  initialPatientActivationLookupActionState,
  type PatientActivationLookupActionState,
} from "@/modules/patient-activation/transport/action-state";

import { PatientActivationHandoff } from "./patient-activation-handoff";

type PatientActivationActionsWorkspaceProps = {
  scopes: PatientActivationScope[];
  selectedHospitalId: string;
  selectedScope: PatientActivationScope;
};

const accountStatusLabels: Record<string, string> = {
  ACTIVE: "เปิดใช้งานแล้ว",
  PROVISIONED: "ยังไม่ได้เปิดใช้งาน",
  INVITED: "ต้องตรวจสอบ",
  SUSPENDED: "ต้องตรวจสอบ",
};

const activationStatusLabels: Record<string, string> = {
  ACTIVE: "ไม่ต้องออกลิงก์",
  NOT_ISSUED: "ยังไม่ได้ออกลิงก์",
  ISSUED: "ออกลิงก์แล้ว",
  IN_PROGRESS: "กำลังเปิดใช้งาน",
  EXPIRED: "หมดอายุ",
  RECONCILIATION_REQUIRED: "ต้องตรวจสอบข้อมูล",
};

type PatientActivationLookupType = "NAME" | "NATIONAL_ID" | "HOSPITAL_NUMBER";

function parseLookupType(value: string): PatientActivationLookupType {
  if (value === "NATIONAL_ID" || value === "HOSPITAL_NUMBER") {
    return value;
  }

  return "NAME";
}

function mapLookupError(state: PatientActivationLookupActionState): string | null {
  return state.status === "ERROR" ? state.message : null;
}

export function PatientActivationActionsWorkspace({
  scopes,
  selectedHospitalId,
  selectedScope,
}: PatientActivationActionsWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [lookupState, lookupAction, lookupPending] = useActionState(
    findPatientActivationCandidatesAction,
    initialPatientActivationLookupActionState,
  );
  const [lookupType, setLookupType] = useState<PatientActivationLookupType>("NAME");

  function changeHospital(hospitalId: string): void {
    router.push(`/app/patients/activation?hospitalId=${encodeURIComponent(hospitalId)}`);
  }

  const errorMessage = mapLookupError(lookupState);

  return (
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">ออกลิงก์เปิดใช้งาน</StatusBadge>}
        breadcrumbs={[{ label: "ผู้ป่วย" }, { label: "เปิดใช้งานบัญชีผู้ป่วย" }]}
        description="ออกสิทธิ์เข้าใช้งานเฉพาะผู้ป่วยที่จำเป็นต้องใช้ DEMI โดยผู้ป่วยเป็นผู้ตั้งรหัสผ่านเอง"
        title="เปิดใช้งานบัญชีผู้ป่วย"
      />

      <div className="pt-8">
        <Panel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted">โรงพยาบาลที่ดำเนินการ</p>
              {scopes.length > 1 ? (
                <Select
                  aria-label="โรงพยาบาลที่ดำเนินการ"
                  className="mt-2 max-w-xl"
                  onChange={(event) => changeHospital(event.target.value)}
                  value={selectedHospitalId}
                >
                  {scopes.map((scope) => (
                    <option key={scope.hospitalId} value={scope.hospitalId}>
                      {scope.hospitalName} · {scope.hospitalCode}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="mt-2 text-lg font-semibold text-brand-strong">
                  {selectedScope.hospitalName} · {selectedScope.hospitalCode}
                </p>
              )}
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted">
              ค้นหาได้เฉพาะผู้ป่วยของโรงพยาบาลที่เลือก และจะแสดงข้อมูลเท่าที่จำเป็นต่อการเปิดใช้งานบัญชี
            </p>
          </div>

          <div className="mt-7 border-t border-line pt-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
            <p className="mt-2 text-sm leading-6 text-muted" id="patient-activation-lookup-help">
              {lookupType === "NAME"
                ? "ค้นหาจากชื่อหรือนามสกุล พิมพ์หลายคำเพื่อระบุผู้ป่วยให้ละเอียดขึ้น"
                : lookupType === "NATIONAL_ID"
                  ? "ใช้เลขบัตรประชาชน 13 หลักของผู้ป่วย"
                  : "ใช้ HN ของผู้ป่วยในโรงพยาบาลนี้แบบตรงตัว"}
            </p>
            <form
              action={lookupAction}
              className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-end"
            >
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <label className="block space-y-2 text-sm font-semibold">
                <span>ค้นหาด้วย</span>
                <Select
                  name="lookupType"
                  onChange={(event) => setLookupType(parseLookupType(event.target.value))}
                  value={lookupType}
                >
                  <option value="NAME">ชื่อผู้ป่วย</option>
                  <option value="NATIONAL_ID">เลขบัตรประชาชน</option>
                  <option value="HOSPITAL_NUMBER">HN</option>
                </Select>
              </label>
                <label className="block space-y-2 text-sm font-semibold">
                <span>
                  {lookupType === "NAME"
                    ? "ชื่อผู้ป่วย"
                    : lookupType === "NATIONAL_ID"
                      ? "เลขบัตรประชาชน"
                      : "HN"}
                </span>
                <Input
                  aria-describedby="patient-activation-lookup-help"
                  inputMode={lookupType === "NATIONAL_ID" ? "numeric" : "text"}
                  maxLength={
                    lookupType === "NAME"
                      ? PATIENT_ACTIVATION_NAME_MAX_LENGTH
                      : lookupType === "NATIONAL_ID"
                        ? 13
                        : PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH
                  }
                  name="value"
                  placeholder={
                    lookupType === "NAME"
                      ? "เช่น สมชาย ใจดี"
                      : lookupType === "NATIONAL_ID"
                        ? "เลข 13 หลัก"
                        : "เช่น HN-001"
                  }
                  required
                  type="text"
                />
              </label>
              <Button disabled={lookupPending} loading={lookupPending} type="submit">
                {lookupPending ? "กำลังค้นหา..." : "ค้นหา"}
              </Button>
            </form>
            {lookupPending ? (
              <p className="mt-4 text-sm text-muted" role="status">
                กำลังค้นหาผู้ป่วย...
              </p>
            ) : null}
            {errorMessage ? (
              <Alert className="mt-4" variant="danger">
                <p className="font-semibold">
                  {lookupState.status === "ERROR" && lookupState.code === "TOO_MANY_RESULTS"
                    ? "พบผู้ป่วยหลายรายการ"
                    : "ค้นหาผู้ป่วยไม่สำเร็จ"}
                </p>
                <p className="mt-1">{errorMessage}</p>
              </Alert>
            ) : null}
          </div>
        </Panel>

        {lookupState.status === "SUCCESS" ? (
          <section aria-busy={lookupPending} className="mt-6" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">ผลการค้นหา</h2>
                {lookupPending ? (
                  <p className="mt-1 text-sm text-muted" role="status">
                    กำลังอัปเดตผลการค้นหา...
                  </p>
                ) : null}
              </div>
              <p className="text-sm text-muted">พบ {lookupState.candidates.length} รายการ</p>
            </div>
            {lookupState.candidates.length > 0 ? (
              <div className="mt-4 space-y-4">
                {lookupState.candidates.map((candidate) => (
                  <article
                    className="rounded-panel border border-border bg-surface p-5 sm:p-7"
                    key={`${candidate.userId}-${candidate.hospitalId}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold text-ink">
                          {candidate.displayName}
                        </h3>
                        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm leading-6 text-muted sm:grid-cols-2">
                          <div>
                            <dt className="inline">HN: </dt>
                            <dd className="inline font-semibold text-ink">
                              {candidate.hospitalNumber ?? "ไม่ระบุ"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">บัญชี: </dt>
                            <dd className="inline font-semibold text-ink">
                              {accountStatusLabels[candidate.accountStatus] ?? "ต้องตรวจสอบ"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">การเปิดใช้งานบัญชี: </dt>
                            <dd className="inline font-semibold text-ink">
                              {activationStatusLabels[candidate.activationStatus] ?? "ต้องตรวจสอบ"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                    <PatientActivationHandoff candidate={candidate} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center text-sm leading-6 text-text-muted sm:px-7">
                <p className="font-semibold text-ink">ไม่พบผู้ป่วยตามข้อมูลค้นหา</p>
                <p className="mt-1">ลองตรวจสอบการสะกดชื่อ หรือเลือกค้นหาด้วย HN/เลขบัตรประชาชน</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
