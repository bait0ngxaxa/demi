import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { listPublicActiveHospitals } from "@/modules/patient-access-requests/services/patient-access-request-service";

import { PatientAccessRequestForm } from "./patient-access-request-form";

export const metadata: Metadata = {
  title: "ขอเปิดใช้งานสำหรับผู้ป่วย",
};

export default async function PatientAccessRequestPage(): Promise<React.JSX.Element> {
  await connection();
  const hospitals = await listPublicActiveHospitals();

  return (
    <main className="min-h-svh bg-canvas px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          className="inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href="/login"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
        <div className="mt-8">
          <PageHeader
            description="ช่องทางส่งคำขอเข้าใช้งานสำหรับผู้ป่วย โดยโรงพยาบาลจะตรวจสอบก่อนเปิดใช้งานบัญชี"
            title="ขอเปิดใช้งานสำหรับผู้ป่วย"
          />
        </div>
        <div className="mt-6">
          <PatientAccessRequestForm hospitals={hospitals} />
        </div>
      </div>
    </main>
  );
}
