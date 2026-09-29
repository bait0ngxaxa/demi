import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";

import { PatientSelfRelationshipList } from "./patient-self-relationship-list";

type ProfileField = {
  label: string;
  value: string | null;
  wide?: boolean;
};

function displayRecordedValue(value: string | null): string {
  const normalized = value?.trim();
  return normalized || "ยังไม่ได้บันทึก";
}

function ProfileFields({ fields }: { fields: readonly ProfileField[] }): React.JSX.Element {
  return (
    <dl className="mt-4 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
      {fields.map((field) => (
        <div className={field.wide ? "min-w-0 sm:col-span-2" : "min-w-0"} key={field.label}>
          <dt className="text-sm font-semibold text-text-muted">{field.label}</dt>
          <dd className="mt-1 break-words text-base font-medium leading-7 text-text">
            {displayRecordedValue(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PatientSelfProfileView({
  patient,
}: {
  patient: PatientSelfContext | null;
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href="/app/personal"
          >
            กลับหน้าส่วนตัว
          </Link>
        }
        breadcrumbs={[{ label: "พื้นที่ส่วนตัว", href: "/app/personal" }, { label: "ข้อมูลของฉัน" }]}
        description="ข้อมูลที่บันทึกไว้ในโปรไฟล์ผู้ป่วยของคุณ"
        title="ข้อมูลของฉัน"
      />

      {patient ? (
        <>
          <section aria-labelledby="patient-self-profile-identity" className="mt-6">
            <Panel>
              <h2
                className="text-xl font-semibold tracking-[-0.02em] text-text"
                id="patient-self-profile-identity"
              >
                ข้อมูลระบุตัวตน
              </h2>
              <ProfileFields
                fields={[
                  { label: "ชื่อ", value: patient.person.givenName },
                  { label: "นามสกุล", value: patient.person.familyName },
                ]}
              />
            </Panel>
          </section>

          <section aria-labelledby="patient-self-profile-contact" className="mt-6">
            <Panel>
              <h2
                className="text-xl font-semibold tracking-[-0.02em] text-text"
                id="patient-self-profile-contact"
              >
                ข้อมูลติดต่อ
              </h2>
              <ProfileFields
                fields={[
                  { label: "เบอร์โทรศัพท์", value: patient.profile.phoneNumber },
                  { label: "ที่อยู่", value: patient.profile.addressText, wide: true },
                ]}
              />
            </Panel>
          </section>

          <PatientSelfRelationshipList relationships={patient.hospitalRelationships} />
        </>
      ) : (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้</p>
          <p className="mt-1">ข้อมูลส่วนตัวจะแสดงเมื่อมีโปรไฟล์ผู้ป่วยที่เชื่อมกับบัญชีของคุณ</p>
        </Alert>
      )}
    </div>
  );
}
