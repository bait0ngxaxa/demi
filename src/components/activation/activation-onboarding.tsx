import Link from "next/link";
import type { Ref } from "react";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";

export function ActivationJourney({ passwordSet = false }: { passwordSet?: boolean }): React.JSX.Element {
  return (
    <ol aria-label="ขั้นตอนเริ่มใช้งาน DEMI" className="flex flex-wrap gap-x-3 gap-y-2 text-sm leading-6 text-brand-strong">
      <li aria-current={passwordSet ? undefined : "step"}>1. ตั้งรหัสผ่าน{passwordSet ? "แล้ว" : ""}<span aria-hidden="true" className="ml-3">→</span></li>
      <li aria-current={passwordSet ? "step" : undefined}>2. เชื่อม LINE (เลือกได้)<span aria-hidden="true" className="ml-3">→</span></li>
      <li>3. เริ่มใช้งาน</li>
    </ol>
  );
}

export function ActivationIntroduction(): React.JSX.Element {
  return (
    <div className="space-y-3 text-sm leading-6 text-muted">
      <ActivationJourney />
      <p>ตั้งรหัสผ่านเพื่อเปิดใช้งานบัญชีของคุณ หลังจากนั้นสามารถเชื่อมกับ LINE เพื่อใช้บริการ DEMI ผ่านเมนูในแชตได้สะดวกขึ้น</p>
      <p>คุณสามารถใช้ DEMI ผ่านเว็บไซต์ได้ แม้ยังไม่ได้เชื่อมบัญชี LINE</p>
    </div>
  );
}

export function ActivationSuccess({
  lineAccountUrl,
  statusRef,
}: {
  lineAccountUrl: string | null;
  statusRef: Ref<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <section className="mt-8 space-y-5">
      <div ref={statusRef} role="status" aria-live="off" tabIndex={-1} aria-labelledby="activation-success-title" aria-describedby="activation-success-description" className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
        <Alert role="none" variant="success">
          <h2 id="activation-success-title" className="text-xl font-semibold">เปิดใช้งานบัญชีสำเร็จ!</h2>
          <p id="activation-success-description" className="mt-2">บัญชี DEMI ของคุณพร้อมใช้งานแล้ว</p>
        </Alert>
      </div>
      <ActivationJourney passwordSet />
      <div className="space-y-3 text-sm leading-6 text-muted">
        <h3 className="text-lg font-semibold text-ink">ขั้นตอนถัดไป: เชื่อม LINE</h3>
        <p>เชื่อมบัญชี LINE เพื่อใช้งานเมนู DEMI จากแชตได้สะดวก โดยไม่ต้องค้นหาเว็บไซต์ทุกครั้ง</p>
        <p>การตั้งรหัสผ่านยังไม่ได้เชื่อม LINE คุณเลือกเชื่อมภายหลังได้</p>
      </div>
      {lineAccountUrl ? (
        <a className={buttonClassName({ className: "w-full" })} href={lineAccountUrl} rel="noreferrer" referrerPolicy="no-referrer">
          เชื่อม LINE เพื่อเริ่มใช้งาน
        </a>
      ) : (
        <Alert variant="info">ขณะนี้ยังเปิดหน้าเชื่อม LINE ไม่ได้ คุณเข้าสู่ระบบผ่านเว็บก่อนได้ แล้วเชื่อม LINE ภายหลังจากเมนูบัญชีในแชต DEMI</Alert>
      )}
      <Link className={buttonClassName({ variant: "secondary", className: "w-full" })} href="/login">
        เข้าสู่ระบบผ่านเว็บก่อน
      </Link>
      <div className="space-y-2 text-sm leading-6 text-muted">
        <p>หากระบบขอให้เข้าสู่ระบบ DEMI อีกครั้ง ให้ใช้เลขบัตรประชาชนและรหัสผ่านที่เพิ่งตั้งไว้</p>
        <p>เบราว์เซอร์กับ LINE อาจไม่ได้ใช้การเข้าสู่ระบบร่วมกัน หน้าเชื่อมบัญชีจะขอให้ยืนยันรหัสผ่านอีกครั้งเพื่อความปลอดภัย</p>
        <p>หากเปิด LINE ไม่ได้ ให้เปิดแชต DEMI แล้วเลือกเมนูบัญชี หรือใช้ DEMI ผ่านเว็บไซต์ได้</p>
      </div>
    </section>
  );
}
