import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

/** Explanatory state for a denied Patient entry route; the decision is made on the server. */
export function PatientAccessUnavailableState({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-3xl">
      <PageHeader description="เมนูนี้แสดงข้อมูลของบัญชีผู้ป่วยเท่านั้น" title={title} />
      <Alert className="mt-6" variant="info">
        <p className="font-semibold">บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้</p>
        <p className="mt-1">
          บัญชีที่เข้าสู่ระบบอยู่ไม่มีข้อมูลผู้ป่วยที่ใช้งานได้สำหรับเมนูนี้ หากคุณเปิดจากเมนูผู้ป่วยใน LINE
          ให้ออกจากระบบ แล้วเข้าสู่ระบบด้วยบัญชีผู้ป่วยของคุณ หากยังเปิดไม่ได้ โปรดติดต่อโรงพยาบาลที่ดูแลคุณ
        </p>
      </Alert>
      <Link className={buttonClassName({ variant: "secondary", className: "mt-6 w-full sm:w-auto" })} href="/app" prefetch={false}>
        ไปหน้าหลัก
      </Link>
    </div>
  );
}
