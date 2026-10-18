import Link from "next/link";

import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import {
  LINE_WORKFLOW_LOGIN_RETURN_PATH,
} from "@/modules/line/domain/line-navigation-intents";
import { lineWorkflowAppointmentLinks } from "@/modules/line/domain/line-workflow-routes";
import type { LineWorkflowScopedFailureState } from "@/modules/line/transport/workflow-scoped-appointments";

export const lineWorkflowScopedButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring sm:w-auto";
export const lineWorkflowScopedSecondaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-center font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring sm:w-auto";

type Recovery = "GATEWAY" | "LOGIN" | "RETRY" | "ACCOUNT" | "ROOT";

const copy: Record<LineWorkflowScopedFailureState, { title: string; body: string; recovery: readonly Recovery[] }> = {
  NOT_ACTIVATED: {
    title: "ยังไม่เปิดให้บริการ",
    body: "นัดหมายผ่าน LINE MINI App ยังไม่เปิดใช้งาน ดูนัดหมายได้ที่ DEMI บนเว็บ",
    recovery: [],
  },
  SCOPE_MISSING: {
    title: "กรุณาเปิดจากเมนู DEMI ใน LINE",
    body: "หน้านี้ใช้ได้เมื่อเปิดจากเมนู DEMI ใน LINE และยืนยันบัญชีแล้วเท่านั้น",
    recovery: ["GATEWAY"],
  },
  SCOPE_EXPIRED: {
    title: "หมดเวลาการใช้งานแล้ว",
    body: "เพื่อความปลอดภัย การดูนัดหมายผ่าน LINE มีเวลาจำกัด กรุณาเริ่มใหม่เพื่อยืนยันบัญชีอีกครั้ง",
    recovery: ["GATEWAY"],
  },
  SCOPE_REVOKED: {
    title: "การเชื่อมบัญชี LINE เปลี่ยนไป",
    body: "บัญชี LINE ถูกยกเลิกการเชื่อมหรือเชื่อมใหม่หลังจากเปิดหน้านี้ กรุณาตรวจสอบที่หน้าบัญชี LINE แล้วเริ่มใหม่จากเมนู",
    recovery: ["ACCOUNT", "GATEWAY"],
  },
  SESSION_MISMATCH: {
    title: "การเข้าสู่ระบบเปลี่ยนไป",
    body: "การเข้าสู่ระบบ DEMI ตอนนี้ไม่ตรงกับตอนที่เปิดหน้านี้ กรุณาเริ่มใหม่จากเมนู DEMI ใน LINE",
    recovery: ["GATEWAY"],
  },
  LOGIN_REQUIRED: {
    title: "เข้าสู่ระบบ DEMI",
    body: "กรุณาเข้าสู่ระบบด้วยบัญชี DEMI เดียวกับที่เชื่อมกับ LINE นี้ จากนั้นระบบจะตรวจสอบอีกครั้ง",
    recovery: ["LOGIN"],
  },
  AUTH_UNAVAILABLE: {
    title: "ตรวจสอบการเข้าสู่ระบบไม่ได้ชั่วคราว",
    body: "กรุณาลองอีกครั้งในอีกสักครู่",
    recovery: ["RETRY"],
  },
  RATE_LIMITED: {
    title: "ส่งคำขอบ่อยเกินไป",
    body: "กรุณารอสักครู่ก่อนลองใหม่ รายการนี้ยังไม่ได้บันทึก",
    recovery: ["RETRY"],
  },
  INELIGIBLE: {
    title: "ยังใช้งานนัดหมายผ่าน LINE ไม่ได้",
    body: "บัญชีนี้ยังไม่พร้อมสำหรับนัดหมายผู้ป่วยผ่าน LINE หากคิดว่าไม่ถูกต้อง กรุณาติดต่อโรงพยาบาล",
    recovery: [],
  },
  RESOURCE_INVALID: {
    title: "ไม่พบรายการนี้",
    body: "ลิงก์ไม่ถูกต้อง หรือรายการนี้ไม่อยู่ในนัดหมายของคุณ",
    recovery: ["ROOT"],
  },
  TEMPORARILY_UNAVAILABLE: {
    title: "ระบบไม่พร้อมใช้งานชั่วคราว",
    body: "กรุณาลองอีกครั้งในอีกสักครู่",
    recovery: ["RETRY"],
  },
};

/**
 * Denied or unavailable scoped reads render only this finite Thai status:
 * never Patient data, never the legitimate empty state, never an ordinary /app substitute.
 */
export function LineWorkflowScopedFailure({
  state,
  retryHref,
}: {
  state: LineWorkflowScopedFailureState;
  /** Fixed scoped destination of the current page, built by the link adapter. */
  retryHref: string;
}): React.JSX.Element {
  const current = copy[state];
  const actions: Record<Recovery, React.JSX.Element> = {
    // Full-document navigations: recovery always starts a fresh server check.
    GATEWAY: <a className={lineWorkflowScopedButtonClass} href={LINE_WORKFLOW_LOGIN_RETURN_PATH} key="gateway">เริ่มใหม่จากหน้าเปิดนัดหมาย</a>,
    LOGIN: <a className={lineWorkflowScopedButtonClass} href={buildLoginReturnHref(LINE_WORKFLOW_LOGIN_RETURN_PATH)} key="login">เข้าสู่ระบบ DEMI</a>,
    RETRY: <a className={lineWorkflowScopedButtonClass} href={retryHref} key="retry">ลองอีกครั้ง</a>,
    ACCOUNT: <Link className={lineWorkflowScopedSecondaryButtonClass} href="/line/account" key="account" prefetch={false}>ไปที่บัญชี LINE</Link>,
    ROOT: <a className={lineWorkflowScopedButtonClass} href={lineWorkflowAppointmentLinks.root} key="root">กลับไปเลือกโรงพยาบาล</a>,
  };

  return (
    <section aria-labelledby="line-workflow-scoped-status" className="mt-6 rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-7">
      <div className="space-y-4" role="status">
        <h1 className="text-2xl font-semibold" id="line-workflow-scoped-status">{current.title}</h1>
        <p className="type-readable text-base text-muted">{current.body}</p>
      </div>
      {current.recovery.length > 0 ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {current.recovery.map((recovery) => actions[recovery])}
        </div>
      ) : null}
    </section>
  );
}
