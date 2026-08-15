"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import type { PatientActivationScope } from "@/modules/patient-activation/services/patient-activation-query-service";
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
  PROVISIONED: "ยังไม่เปิดใช้งาน",
  INVITED: "ต้องตรวจสอบ",
  SUSPENDED: "ต้องตรวจสอบ",
};

const activationStatusLabels: Record<string, string> = {
  ACTIVE: "ไม่ต้องออกลิงก์",
  NOT_ISSUED: "ยังไม่ได้ออก",
  ISSUED: "ออกแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  EXPIRED: "หมดอายุ",
  RECONCILIATION_REQUIRED: "ต้องตรวจสอบ",
};

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
  const [lookupType, setLookupType] = useState<"NATIONAL_ID" | "HOSPITAL_NUMBER">(
    "NATIONAL_ID",
  );

  function changeHospital(hospitalId: string): void {
    router.push(`/app/patients/activation?hospitalId=${encodeURIComponent(hospitalId)}`);
  }

  const errorMessage = mapLookupError(lookupState);

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-6 px-5 py-5 sm:items-center sm:px-8 lg:px-10">
          <div>
            <a
              className="text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/app"
            >
              ← กลับไปพื้นที่ทำงาน
            </a>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              เปิดใช้งานบัญชีผู้ป่วย
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              ค้นหาผู้ป่วยที่จำเป็นต้องเข้าใช้งาน DEMI แล้วออกลิงก์ครั้งเดียวให้ผู้ป่วยตั้งรหัสผ่านเอง
            </p>
          </div>
          <span className="hidden rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-strong sm:inline-flex">
            patient:activation:issue
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
        <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted">โรงพยาบาลที่ดำเนินการ</p>
              {scopes.length > 1 ? (
                <select
                  className="mt-2 h-12 w-full max-w-xl rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                  onChange={(event) => changeHospital(event.target.value)}
                  value={selectedHospitalId}
                >
                  {scopes.map((scope) => (
                    <option key={scope.hospitalId} value={scope.hospitalId}>
                      {scope.hospitalName} · {scope.hospitalCode}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-2 text-lg font-semibold text-brand-strong">
                  {selectedScope.hospitalName} · {selectedScope.hospitalCode}
                </p>
              )}
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted">
              ระบบตรวจสอบสิทธิ์และขอบเขตโรงพยาบาลจากข้อมูลฝั่งเซิร์ฟเวอร์ทุกครั้ง
              การค้นหานี้แสดงเฉพาะข้อมูลที่จำเป็นต่อการเปิดใช้งานบัญชี
            </p>
          </div>

          <div className="mt-7 border-t border-line pt-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              ใช้เลขบัตรประชาชนแบบตรงตัว หรือ HN แบบตรงตัวภายในโรงพยาบาลนี้
            </p>
            <form action={lookupAction} className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-end">
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <label className="block space-y-2 text-sm font-semibold">
                <span>ค้นหาด้วย</span>
                <select
                  className="h-12 w-full rounded-[12px] border border-line bg-white px-4 font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                  name="lookupType"
                  onChange={(event) =>
                    setLookupType(
                      event.target.value === "HOSPITAL_NUMBER"
                        ? "HOSPITAL_NUMBER"
                        : "NATIONAL_ID",
                    )
                  }
                  value={lookupType}
                >
                  <option value="NATIONAL_ID">เลขบัตรประชาชน</option>
                  <option value="HOSPITAL_NUMBER">HN</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>{lookupType === "NATIONAL_ID" ? "เลขบัตรประชาชน" : "HN"}</span>
                <input
                  className="h-12 w-full rounded-[12px] border border-line px-4 font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                  inputMode={lookupType === "NATIONAL_ID" ? "numeric" : "text"}
                  maxLength={lookupType === "NATIONAL_ID" ? 13 : 64}
                  name="value"
                  required
                  type="text"
                />
              </label>
              <button
                className="flex min-h-12 items-center justify-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted"
                disabled={lookupPending}
                type="submit"
              >
                {lookupPending ? "กำลังค้นหา..." : "ค้นหา"}
              </button>
            </form>
            {errorMessage ? (
              <p className="mt-4 text-sm leading-6 text-danger" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </section>

        {lookupState.status === "SUCCESS" ? (
          <section className="mt-6" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ผลการค้นหา</h2>
              <p className="text-sm text-muted">พบ {lookupState.candidates.length} รายการ</p>
            </div>
            {lookupState.candidates.length > 0 ? (
              <div className="mt-4 space-y-4">
                {lookupState.candidates.map((candidate) => (
                  <article
                    className="rounded-[16px] border border-line bg-white p-5 sm:p-7"
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
                            <dt className="inline">Activation: </dt>
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
              <div className="mt-4 rounded-[16px] border border-dashed border-line bg-white px-5 py-8 text-center text-sm leading-6 text-muted sm:px-7">
                ไม่พบผู้ป่วยตามข้อมูลค้นหาในโรงพยาบาลนี้
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
