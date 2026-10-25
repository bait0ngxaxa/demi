"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalSelfRegistrationSetting } from "@/modules/hospital-settings/services/hospital-self-registration-settings-service";
import {
  setHospitalSelfRegistrationEnabledAction,
  type HospitalSelfRegistrationSettingActionState,
} from "@/modules/hospital-settings/transport/server-actions";

const initialState: HospitalSelfRegistrationSettingActionState = { status: "IDLE" };

function HospitalSelfRegistrationSettingRow({ setting }: { setting: HospitalSelfRegistrationSetting }): React.JSX.Element {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setHospitalSelfRegistrationEnabledAction, initialState);
  const enabled = state.status === "SUCCESS" ? state.enabled : setting.enabled;

  useEffect(() => {
    if (state.status === "SUCCESS") router.refresh();
  }, [router, state]);

  return (
    <li className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{setting.hospitalName}</p>
        <p className="mt-1 text-sm text-muted">การลงทะเบียนเองด้วยเลขบัตร</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge variant={enabled ? "success" : "neutral"}>{enabled ? "เปิดอยู่" : "ปิดอยู่"}</StatusBadge>
        <form action={formAction}>
          <input name="hospitalId" type="hidden" value={setting.hospitalId} />
          <input name="enabled" type="hidden" value={enabled ? "false" : "true"} />
          <button
            aria-busy={pending || undefined}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            disabled={pending}
            type="submit"
          >
            {pending ? "กำลังบันทึก..." : enabled ? "ปิดการลงทะเบียนเอง" : "เปิดการลงทะเบียนเอง"}
          </button>
        </form>
      </div>
      <div aria-live="polite" className="sm:basis-full">
        {state.status === "ERROR" ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}
        {state.status === "SUCCESS" ? (
          <p className="text-sm text-muted" role="status">
            {state.changed ? "บันทึกการตั้งค่าแล้ว" : "การตั้งค่านี้ใช้อยู่แล้ว"}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function HospitalSelfRegistrationSettings({
  hospitals,
}: {
  hospitals: readonly HospitalSelfRegistrationSetting[];
}): React.JSX.Element | null {
  if (hospitals.length === 0) return null;
  return (
    <section aria-labelledby="hospital-self-registration-heading" className="border-t border-border pt-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="hospital-self-registration-heading">
        การลงทะเบียนด้วยตนเอง
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
        ค่าเริ่มต้นเปิดอยู่ ปิดการลงทะเบียนเองได้ทันทีสำหรับโรงพยาบาลที่คุณเป็น OWNER
        รายชื่อที่ลงทะเบียนเองจะแสดงวันที่ในรายชื่อ และเลือกกรองรายการเหล่านั้นได้
      </p>
      <ul className="mt-3 divide-y divide-line">
        {hospitals.map((setting) => (
          <HospitalSelfRegistrationSettingRow key={setting.hospitalId} setting={setting} />
        ))}
      </ul>
    </section>
  );
}
