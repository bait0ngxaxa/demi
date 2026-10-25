import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  HOSPITAL_CONTACT_CAPABILITIES,
  decideHospitalContactPolicy,
} from "@/modules/hospital-contact/policies/hospital-contact-policy";
import { listEligibleHospitalContactOwnerHospitals } from "@/modules/hospital-contact/services/hospital-contact-service";
import { listOwnedHospitalSelfRegistrationSettings } from "@/modules/hospital-settings/services/hospital-self-registration-settings-service";
import { PATIENT_SERVICE_REQUEST_CAPABILITIES, decidePatientServiceRequestPolicy } from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import { listManagedHospitalServiceCatalog } from "@/modules/patient-service-requests/services/patient-service-catalog-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalSelfRegistrationSettings } from "../../settings/hospital-self-registration-settings";

export const metadata: Metadata = { title: "ตั้งค่าโรงพยาบาล" };

type HospitalSettingsPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HospitalSettingsPage({ searchParams }: HospitalSettingsPageProps): Promise<React.JSX.Element> {
  await connection();
  let actor;
  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }

  const params = await searchParams;
  if (Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) notFound();
  const requestedHospitalId = scalar(params.hospitalId);
  const contactIds = new Set(actor.hospitalMemberships.flatMap((membership) =>
    decideHospitalContactPolicy({
      actor,
      capability: HOSPITAL_CONTACT_CAPABILITIES.read,
      scope: "DIRECT_HOSPITAL_OWNER",
      hospitalId: membership.hospitalId,
    }).allowed ? [membership.hospitalId] : [],
  ));
  const catalogIds = new Set(actor.hospitalMemberships.flatMap((membership) =>
    decidePatientServiceRequestPolicy({
      actor,
      capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog,
      hospitalId: membership.hospitalId,
    }).allowed ? [membership.hospitalId] : [],
  ));

  const [contactHospitals, catalogs, selfRegistrationHospitals] = await Promise.all([
    contactIds.size > 0 ? listEligibleHospitalContactOwnerHospitals(actor) : Promise.resolve([]),
    catalogIds.size > 0 ? listManagedHospitalServiceCatalog(actor) : Promise.resolve([]),
    listOwnedHospitalSelfRegistrationSettings(actor),
  ]);
  const contacts = contactHospitals.filter(({ id }) => contactIds.has(id));
  const services = catalogs.filter(({ hospitalId }) => catalogIds.has(hospitalId));
  const selfRegistration = selfRegistrationHospitals.filter(({ hospitalId }) =>
    !requestedHospitalId || hospitalId === requestedHospitalId,
  );
  const visibleContacts = contacts.filter(({ id }) => !requestedHospitalId || id === requestedHospitalId);
  const visibleServices = services.filter(({ hospitalId }) => !requestedHospitalId || hospitalId === requestedHospitalId);
  const hasRequestedHospital = [
    ...visibleContacts.map(({ id }) => id),
    ...visibleServices.map(({ hospitalId }) => hospitalId),
    ...selfRegistration.map(({ hospitalId }) => hospitalId),
  ].includes(requestedHospitalId ?? "");

  if (requestedHospitalId && !hasRequestedHospital) notFound();
  if (visibleContacts.length === 0 && visibleServices.length === 0 && selfRegistration.length === 0) redirect("/app");

  return (
    <div className="content-workspace min-w-0 max-w-4xl break-words">
      <PageHeader
        breadcrumbs={[
          { href: requestedHospitalId ? `/app?hospitalId=${encodeURIComponent(requestedHospitalId)}` : "/app", label: "งานโรงพยาบาล" },
          { label: "ตั้งค่าโรงพยาบาล" },
        ]}
        description="ตั้งค่าข้อมูลของโรงพยาบาลตามสิทธิ์ที่คุณได้รับ แต่ละส่วนตรวจสอบสิทธิ์แยกกัน"
        title="ตั้งค่าโรงพยาบาล"
      />

      <div className="mt-6 space-y-6">
        {visibleContacts.length > 0 ? (
          <Panel>
            <h2 className="text-lg font-semibold text-text">ข้อมูลติดต่อ</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">ที่อยู่และหมายเลขโทรศัพท์ที่โรงพยาบาลให้ผู้ป่วยใช้ติดต่อ</p>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {visibleContacts.map((hospital) => (
                <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" key={hospital.id}>
                  <span className="min-w-0 font-medium text-text">{hospital.name}</span>
                  <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/contact?hospitalId=${encodeURIComponent(hospital.id)}`}>
                    จัดการข้อมูลติดต่อ
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {visibleServices.length > 0 ? (
          <Panel>
            <h2 className="text-lg font-semibold text-text">บริการที่ผู้ป่วยขอได้</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">กำหนดประเภทคำขอที่ผู้ป่วยส่งให้โรงพยาบาลได้ การตั้งค่านี้ไม่ใช่การทบทวนคำขอหรือการส่งมอบบริการ</p>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {visibleServices.map((hospital) => (
                <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" key={hospital.hospitalId}>
                  <span className="min-w-0 font-medium text-text">{hospital.hospitalName}</span>
                  <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/patients/service-catalog?hospitalId=${encodeURIComponent(hospital.hospitalId)}`}>
                    จัดการบริการที่เปิดให้ขอ
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <HospitalSelfRegistrationSettings hospitals={selfRegistration} />
      </div>
    </div>
  );
}
