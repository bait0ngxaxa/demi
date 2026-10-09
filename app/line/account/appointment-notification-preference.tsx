"use client";

import { useActionState } from "react";

import {
  setAppointmentLineNotificationPreferenceAction,
  type AppointmentLineNotificationPreferenceActionState,
} from "@/modules/appointments/transport/appointment-line-notification-actions";

const initialState: AppointmentLineNotificationPreferenceActionState = { status: "IDLE" };

export type AppointmentNotificationPreferenceView = {
  enabled: boolean;
  canEnable: boolean;
};

export function AppointmentNotificationPreference({
  initial,
}: {
  initial: AppointmentNotificationPreferenceView;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    setAppointmentLineNotificationPreferenceAction,
    initialState,
  );
  const enabled = state.status === "SUCCESS" ? state.enabled : initial.enabled;
  const canEnable = state.status === "SUCCESS" ? state.canEnable : initial.canEnable;

  return (
    <section
      className="mt-5 rounded-panel border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="appointment-notification-preference"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="appointment-notification-preference" className="text-xl font-semibold">
          การแจ้งเตือนนัดหมายทาง LINE
        </h2>
        <p className="rounded-control bg-surface-muted px-3 py-1 text-sm font-semibold" aria-live="polite">
          สถานะ: {enabled ? "เปิด" : "ปิด"}
        </p>
      </div>
      <div className="type-readable mt-4 space-y-3 text-sm text-muted">
        <p>ใช้สำหรับแจ้งเมื่อมีการสร้าง เปลี่ยนแปลง หรือยกเลิกนัดหมายของคุณเท่านั้น</p>
        <p className="text-ink">ข้อความที่ส่ง: “มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ”</p>
        <p>การเปิดใช้เป็นการอนุญาตให้ระบบพยายามส่งข้อความ ไม่รับประกันว่าข้อความจะถึงหรือแสดงบนอุปกรณ์ คุณปิดได้ทุกเมื่อ</p>
        <p>การเชื่อมบัญชี LINE หรือการเป็นเพื่อนกับ DEMI ไม่ได้เปิดการแจ้งเตือนให้อัตโนมัติ ระบบตรวจสอบบัญชีและสถานะเพื่อนอีกครั้งก่อนพยายามส่ง</p>
      </div>
      {!canEnable && !enabled ? (
        <p className="mt-4 rounded-control bg-surface-muted px-4 py-3 text-sm text-ink">
          เชื่อมบัญชี LINE ก่อน จึงจะเปิดการแจ้งเตือนได้
        </p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="mt-4 rounded-control bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "SUCCESS" ? (
        <p className="mt-4 text-sm text-success" role="status" aria-live="polite">
          {state.enabled ? "เปิดการแจ้งเตือนแล้ว" : "ปิดการแจ้งเตือนแล้ว"}
        </p>
      ) : null}
      <form action={formAction} className="mt-4">
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <button
          type="submit"
          disabled={pending || (!enabled && !canEnable)}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring sm:w-auto"
        >
          {pending ? "กำลังบันทึก…" : enabled ? "ปิดการแจ้งเตือน" : "เปิดการแจ้งเตือน"}
        </button>
      </form>
    </section>
  );
}
