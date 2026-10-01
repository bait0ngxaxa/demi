import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";

import { PatientSelfRelationshipList } from "./patient-self-relationship-list";

function getPersistedDisplayName(patient: PatientSelfContext): string {
  const name = [patient.person.givenName, patient.person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || "ยังไม่ได้บันทึกชื่อในระบบ";
}

export function PatientPersonalHome({
  patient,
}: {
  patient: PatientSelfContext | null;
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        actions={
          patient ? (
            <nav aria-label="ทางลัดพื้นที่ส่วนตัว" className="flex flex-wrap gap-2">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/app/personal/care"
              >
                ข้อมูลการดูแล
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/app/personal/appointments"
              >
                นัดหมาย
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/app/personal/services"
              >
                บริการของฉัน
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/app/personal/profile"
              >
                ข้อมูลของฉัน
              </Link>
            </nav>
          ) : undefined
        }
        description="ดูข้อมูลผู้ป่วยที่เชื่อมกับบัญชีของคุณ"
        title="พื้นที่ส่วนตัว"
      />

      {patient ? (
        <>
          <section aria-labelledby="patient-self-identity-heading" className="mt-6">
            <Panel>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2
                    className="break-words text-2xl font-semibold tracking-[-0.03em] text-text"
                    id="patient-self-identity-heading"
                  >
                    {getPersistedDisplayName(patient)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    ข้อมูลส่วนตัวของบัญชีผู้ป่วย
                  </p>
                </div>
                <div aria-label="บริบทปัจจุบัน" className="flex flex-wrap gap-2">
                  <StatusBadge variant="info">ผู้ป่วย</StatusBadge>
                  <StatusBadge variant="success">พื้นที่ส่วนตัว</StatusBadge>
                </div>
              </div>
            </Panel>
          </section>

          <PatientSelfRelationshipList relationships={patient.hospitalRelationships} />
        </>
      ) : (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ข้อมูลผู้ป่วยยังไม่พร้อมแสดง</p>
          <p className="mt-1">ยังไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้</p>
        </Alert>
      )}
    </div>
  );
}
