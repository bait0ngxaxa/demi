import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";

export default function PatientDetailNotFound(): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/patients", label: "ผู้ป่วย" }, { label: "ไม่พบข้อมูล" }]}
        description="ระบบไม่สามารถแสดงข้อมูลผู้ป่วยรายการนี้ได้"
        title="ไม่พบข้อมูลผู้ป่วย"
      />
      <div className="pt-8">
        <Alert variant="neutral">
          <p className="font-semibold">ไม่พบข้อมูลผู้ป่วย หรือคุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้</p>
          <p className="mt-1">กรุณากลับไปยังรายชื่อผู้ป่วยและเลือกข้อมูลจากโรงพยาบาลที่คุณได้รับสิทธิ์</p>
        </Alert>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href="/app/patients"
        >
          กลับไปยังรายชื่อผู้ป่วย
        </Link>
      </div>
    </div>
  );
}
