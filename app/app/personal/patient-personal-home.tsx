import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { PatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";

import { PatientSelfRelationshipList } from "./patient-self-relationship-list";

const primaryActions = [
  { href: "/app/personal/care", label: "ข้อมูลการดูแลของฉัน", description: "เลือกโรงพยาบาลเพื่อดูข้อมูลการดูแล โปรแกรม และประวัติที่บันทึกไว้" },
  { href: "/app/personal/appointments", label: "นัดหมายของฉัน", description: "ดูรายละเอียดและประวัตินัดหมายของแต่ละโรงพยาบาล รับทราบนัดหรือขอยกเลิกเมื่อทำได้" },
  { href: "/app/personal/services", label: "คำขอรับบริการของฉัน", description: "เลือกบริการที่โรงพยาบาลเปิดรับคำขอ ดูสถานะ และถอนคำขอเมื่อทำได้" },
] as const;

const supportingActions = [
  { href: "/app/personal/medications", label: "ยาของฉัน", description: "บันทึกรายการยา เวลารายวัน และจัดการรายการส่วนตัวของคุณ" },
  { href: "/app/personal/wellness", label: "บันทึกสุขภาพของฉัน", description: "บันทึกอาหาร การออกกำลังกาย และเป้าหมายน้ำหนักที่คุณตั้งเอง" },
  { href: "/app/personal/profile", label: "ข้อมูลของฉัน", description: "ดูข้อมูลส่วนตัว และแก้ไขข้อมูลที่อนุญาตแยกตามโรงพยาบาล" },
  { href: "/app/personal/news", label: "ข่าวสาร", description: "อ่านประกาศจากโรงพยาบาลที่เชื่อมกับคุณ" },
  { href: "/app/personal/knowledge", label: "สื่อความรู้", description: "อ่านความรู้เรื่อง NCD อาหาร และการออกกำลังกาย" },
] as const;

function getPersistedDisplayName(patient: PatientPersonalHomePageContext): string {
  const name = [patient.person.givenName, patient.person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || "ยังไม่ได้บันทึกชื่อในระบบ";
}

export function PatientPersonalHome({
  patient,
}: {
  patient: PatientPersonalHomePageContext | null;
}): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-4xl">
      <PageHeader description="ดูข้อมูลและจัดการรายการส่วนตัวของคุณ" title="พื้นที่ส่วนตัว" />
      {patient ? (
        <>
          <section aria-labelledby="patient-self-identity-heading" className="mt-6 min-w-0">
            <h2 className="break-words text-xl font-semibold text-text" id="patient-self-identity-heading">
              {getPersistedDisplayName(patient)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">ข้อมูลผู้ป่วยที่เชื่อมกับบัญชีของคุณ</p>
          </section>

          <section aria-labelledby="personal-primary-heading" className="mt-8">
            <h2 className="text-xl font-semibold text-text" id="personal-primary-heading">การดูแลและบริการ</h2>
            <Panel className="mt-4">
              <nav aria-labelledby="personal-primary-heading">
                <ul className="divide-y divide-border">
                  {primaryActions.map((action, index) => (
                    <li className="flex min-w-0 flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={action.href}>
                      <div className="min-w-0 sm:flex-1">
                        <h3 className="break-words text-lg font-semibold text-text">{action.label}</h3>
                        <p className="mt-1 break-words text-sm leading-6 text-text-muted">{action.description}</p>
                      </div>
                      <Link className={buttonClassName({ variant: index === 0 ? "primary" : "secondary", className: "w-full max-w-full break-words text-center sm:w-auto" })} href={action.href} prefetch={false}>
                        {action.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </Panel>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              โรงพยาบาลจะตรวจสอบคำขอรับบริการ การส่งคำขอไม่ได้สร้างโปรแกรมการดูแล นัดหมาย หรือมอบหมาย อสม. ให้อัตโนมัติ
            </p>
          </section>

          <section aria-labelledby="personal-health-heading" className="mt-8">
            <h2 className="text-xl font-semibold text-text" id="personal-health-heading">ดูแลข้อมูลสุขภาพส่วนตัว</h2>
            <nav aria-labelledby="personal-health-heading">
              <ul className="mt-3 grid min-w-0 gap-x-8 sm:grid-cols-2">
                {supportingActions.map((action) => (
                  <li className="min-w-0 border-b border-border py-3" key={action.href}>
                    <h3>
                      <Link className="inline-flex min-h-12 max-w-full items-center break-words rounded-control font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={action.href} prefetch={false}>
                        {action.label}
                      </Link>
                    </h3>
                    <p className="break-words text-sm leading-6 text-text-muted">{action.description}</p>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="mt-3 text-sm leading-6 text-text-muted">รายการยาและบันทึกสุขภาพเป็นข้อมูลที่คุณบันทึกเอง ไม่ใช่คำแนะนำทางการแพทย์จาก DEMI</p>
          </section>

          <PatientSelfRelationshipList relationships={patient.hospitalRelationships} showCareLink />

          <section aria-labelledby="personal-account-heading" className="mt-8 border-t border-border pt-6">
            <h2 className="text-xl font-semibold text-text" id="personal-account-heading">บัญชีและผู้ดูแล</h2>
            <nav aria-labelledby="personal-account-heading" className="mt-3 flex flex-wrap gap-3">
              <Link className={buttonClassName({ variant: "secondary", className: "max-w-full break-words text-center" })} href="/app/personal/password" prefetch={false}>เปลี่ยนรหัสผ่าน</Link>
              <Link className={buttonClassName({ variant: "secondary", className: "max-w-full break-words text-center" })} href="/app/family" prefetch={false}>ความสัมพันธ์ผู้ดูแล</Link>
            </nav>
            <p className="mt-3 text-sm leading-6 text-text-muted">จัดการคำเชิญและความสัมพันธ์ผู้ดูแล การมีความสัมพันธ์ไม่ได้ให้สิทธิ์ดูข้อมูลสุขภาพทั้งหมดโดยอัตโนมัติ</p>
          </section>
        </>
      ) : (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ข้อมูลผู้ป่วยยังไม่พร้อมแสดง</p>
          <p className="mt-1">ยังไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้ หากต้องการตรวจสอบข้อมูล กรุณาติดต่อโรงพยาบาลที่ลงทะเบียนให้คุณ</p>
        </Alert>
      )}
    </div>
  );
}
