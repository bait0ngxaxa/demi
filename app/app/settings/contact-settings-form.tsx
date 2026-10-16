"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { OwnContactSetting } from "@/modules/account-settings/services/contact-setting-service";
import type { OwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import type { OwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { saveOwnContactEmailAction, setMedicationLineRemindersAction } from "@/modules/account-settings/transport/server-actions";
import { AppointmentNotificationPreference } from "../../line/account/appointment-notification-preference";

function MedicationReminderPreference({ initial }: { initial: OwnMedicationLineReminderPreference }): React.JSX.Element {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [canEnable] = useState(initial.canEnable);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  function toggle(): void {
    setMessage(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setMedicationLineRemindersAction>>;
      try {
        result = await setMedicationLineRemindersAction(!enabled);
      } catch {
        setUnknownOutcome(true);
        return;
      }
      if (result.status === "SUCCESS") setEnabled(result.enabled);
      else setMessage(result.message);
    });
  }
  return <section className="mt-5 border-t border-border pt-5" aria-labelledby="medication-line-reminder-heading">
    <h2 className="text-lg font-semibold text-text" id="medication-line-reminder-heading">การแจ้งเตือนยา</h2>
    <p className="mt-2 text-sm leading-6 text-text-muted">ส่งข้อความ LINE เมื่อถึงเวลาที่คุณตั้งไว้สำหรับยาที่ยังใช้งานอยู่ ข้อความจะไม่ระบุชื่อยา และระบบจะปิดการส่งเมื่อคุณหยุดยา ปิดการแจ้งเตือน หรือบัญชี LINE ใช้งานไม่ได้</p>
    <p className="mt-2 text-sm font-medium text-text" aria-live="polite">สถานะ: {enabled ? "เปิด" : "ปิด"}</p>
    {!canEnable && !enabled ? <p className="mt-2 text-sm text-text-muted">เชื่อมบัญชี LINE ก่อนจึงจะเปิดการแจ้งเตือนได้ <a className="font-medium text-brand-strong underline underline-offset-4" href="/line/account">จัดการบัญชี LINE</a></p> : null}
    {message ? <Alert className="mt-3" variant="warning">{message}</Alert> : null}
    <UnknownOutcomeAlert active={unknownOutcome} className="mt-3" recovery={{ kind: "reload" }} />
    <Button className="mt-3" disabled={pending || unknownOutcome || (!enabled && !canEnable)} loading={pending} onClick={toggle} type="button" variant="secondary">{enabled ? "ปิดการแจ้งเตือนยา" : "เปิดการแจ้งเตือนยา"}</Button>
  </section>;
}

export function ContactSettingsForm({ initial, patient }: { initial: OwnContactSetting; patient: { appointment: OwnAppointmentLineNotificationPreference; medication: OwnMedicationLineReminderPreference | null } | null }): React.JSX.Element {
  const [email, setEmail] = useState(initial.email ?? "");
  const [version, setVersion] = useState(initial.version);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ variant: "success" | "warning"; text: string } | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlightRef.current || unknownOutcome) return;
    inFlightRef.current = true;
    setMessage(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveOwnContactEmailAction>>;
      try {
        result = await saveOwnContactEmailAction({ email, expectedVersion: version });
      } catch {
        if (mountedRef.current) setUnknownOutcome(true);
        return;
      }
      if (!mountedRef.current) return;

      if (result.status === "SUCCESS") {
        inFlightRef.current = false;
        setEmail(result.email ?? "");
        setVersion(result.version);
        setMessage({ variant: "success", text: "บันทึกอีเมลติดต่อแล้ว" });
        notify.success("บันทึกอีเมลแล้ว");
      } else if (result.status === "ERROR") {
        if (result.code === "UNAVAILABLE") {
          setUnknownOutcome(true);
          return;
        }
        inFlightRef.current = false;
        setMessage({ variant: "warning", text: result.message });
        if (result.code === "CONFLICT") notify.warning("ข้อมูลเปลี่ยนแปลงแล้ว โปรดโหลดข้อมูลล่าสุด");
        else if (result.code === "FORBIDDEN") notify.error("บัญชีนี้ไม่มีสิทธิ์แก้ไขการตั้งค่า");
      } else {
        setUnknownOutcome(true);
      }
    });
  }

  return <div className="min-w-0 max-w-4xl space-y-8">
    <section aria-labelledby="contact-settings-heading">
      <h2 className="text-xl font-semibold text-text" id="contact-settings-heading">ข้อมูลติดต่อ</h2>
      <form className="mt-4 space-y-4" onSubmit={save}>
        <div className="max-w-xl">
          <label className="mb-2 block text-sm font-medium text-text" htmlFor="contact-email">อีเมลสำหรับติดต่อ</label>
          <Input autoComplete="email" id="contact-email" maxLength={320} onChange={(event) => setEmail(event.currentTarget.value)} type="email" value={email} />
          <p className="mt-2 text-sm leading-6 text-text-muted">อีเมลนี้ใช้เป็นข้อมูลติดต่อเท่านั้น ยังไม่ได้ยืนยัน และจะไม่ใช้เข้าสู่ระบบหรือกู้คืนบัญชี</p>
        </div>
        {message ? <Alert variant={message.variant}>{message.text}</Alert> : null}
        <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload", label: "โหลดและตรวจสอบข้อมูลล่าสุด", message: "ระบบยังยืนยันผลการบันทึกไม่ได้ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบก่อนบันทึกอีกครั้ง" }} />
        <Button disabled={pending || unknownOutcome} loading={pending} type="submit">บันทึกข้อมูลติดต่อ</Button>
      </form>
    </section>
    {patient ? <section aria-labelledby="notification-settings-heading" className="border-t border-border pt-6">
      <h2 className="text-xl font-semibold text-text" id="notification-settings-heading">การแจ้งเตือน</h2>
      <AppointmentNotificationPreference initial={patient.appointment} />
      {patient.medication ? <MedicationReminderPreference initial={patient.medication} /> : <p className="mt-5 text-sm text-text-muted">การตั้งค่าแจ้งเตือนยาเปิดได้เมื่อบัญชีผู้ป่วยและความสัมพันธ์โรงพยาบาลพร้อมใช้งาน</p>}
    </section> : null}
    {patient ? <section aria-labelledby="phone-settings-heading" className="border-t border-border pt-6">
      <h2 className="text-xl font-semibold text-text" id="phone-settings-heading">เบอร์โทรศัพท์ผู้ป่วย</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">เบอร์โทรศัพท์จัดเก็บแยกตามโรงพยาบาลและแก้ไขได้จากข้อมูลโปรไฟล์ผู้ป่วย</p>
      <Link className="mt-3 inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href="/app/personal/profile">ไปที่ข้อมูลของฉัน</Link>
    </section> : null}
  </div>;
}
