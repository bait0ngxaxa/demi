import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";

export default function PatientSelfNotFound(): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ไม่พบข้อมูล" }]}
        description="ระบบไม่สามารถแสดงข้อมูลรายการนี้ได้"
        title="ไม่พบข้อมูล"
      />
      <div className="pt-8">
        <Alert variant="neutral">
          <p className="font-semibold">ไม่พบข้อมูลที่ขอ</p>
          <p className="mt-1">ข้อมูลอาจไม่มีอยู่ หรือไม่พร้อมแสดงในพื้นที่ส่วนตัวของคุณ</p>
        </Alert>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href="/app/personal"
        >
          กลับพื้นที่ส่วนตัว
        </Link>
      </div>
    </div>
  );
}
