import { HospitalStatus } from "@prisma/client";
import Link from "next/link";

import type { PatientSelfContactAvailability } from "@/modules/patient-self/transport/patient-self-page-context";
import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";

type PatientSelfHospitalRelationship = PatientSelfContext["hospitalRelationships"][number] & {
  hospitalContact?: PatientSelfContactAvailability;
};

const hospitalStatusLabels: Record<HospitalStatus, string> = {
  [HospitalStatus.ACTIVE]: "พร้อมใช้งาน",
  [HospitalStatus.SUSPENDED]: "โรงพยาบาลถูกระงับการใช้งาน",
  [HospitalStatus.PENDING_VERIFICATION]: "รอยืนยันการขึ้นทะเบียน",
};

export function PatientSelfRelationshipList({
  relationships,
}: {
  relationships: readonly PatientSelfHospitalRelationship[];
}): React.JSX.Element {
  return (
    <section aria-labelledby="patient-self-hospitals-heading" className="mt-8">
      <h2
        className="text-xl font-semibold tracking-[-0.02em] text-text"
        id="patient-self-hospitals-heading"
      >
        โรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย
      </h2>
      {relationships.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {relationships.map((relationship, index) => (
            <li
              className="min-w-0 py-4"
              key={`${relationship.hospitalCode}-${relationship.hospitalName}-${index}`}
            >
              <h3 className="break-words font-semibold text-text">{relationship.hospitalName}</h3>
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                ข้อมูลนี้ใช้สำหรับโรงพยาบาลนี้
              </p>
              <dl className="mt-2 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-text-muted">รหัสโรงพยาบาล</dt>
                  <dd className="mt-0.5 break-words font-medium text-text">{relationship.hospitalCode}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-text-muted">รหัสผู้ป่วยที่โรงพยาบาล</dt>
                  <dd className="mt-0.5 break-words font-medium text-text">
                    {relationship.hospitalNumber ?? "ยังไม่ได้บันทึก"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-text-muted">สถานะโรงพยาบาล</dt>
                  <dd className="mt-0.5 break-words font-medium text-text">
                    {hospitalStatusLabels[relationship.hospitalStatus]}
                  </dd>
                </div>
              </dl>
              {relationship.hospitalContact ? (
                <section
                  aria-label={`ข้อมูลติดต่อ ${relationship.hospitalName}`}
                  className="mt-5 min-w-0 border-t border-border pt-4"
                >
                  <h4 className="break-words font-semibold text-text">ข้อมูลติดต่อโรงพยาบาล</h4>
                  {relationship.hospitalStatus !== HospitalStatus.ACTIVE ? (
                    <p className="mt-2 break-words text-sm leading-6 text-text-muted">
                      ยังไม่แสดงข้อมูลติดต่อสำหรับโรงพยาบาลนี้
                    </p>
                  ) : relationship.hospitalContact.status === "UNAVAILABLE" ? (
                    <p className="mt-2 break-words text-sm leading-6 text-text-muted">
                      ข้อมูลติดต่อยังไม่พร้อมแสดง
                    </p>
                  ) : relationship.hospitalContact.contact.addressText === null &&
                    relationship.hospitalContact.contact.phoneNumber === null ? (
                    <p className="mt-2 break-words text-sm leading-6 text-text-muted">
                      ยังไม่มีข้อมูลติดต่อ
                    </p>
                  ) : (
                    <dl className="mt-3 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      {relationship.hospitalContact.contact.addressText !== null ? (
                        <div className="min-w-0 sm:col-span-2">
                          <dt className="text-text-muted">ที่อยู่</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-text">
                            {relationship.hospitalContact.contact.addressText}
                          </dd>
                        </div>
                      ) : null}
                      {relationship.hospitalContact.contact.phoneNumber !== null ? (
                        <div className="min-w-0">
                          <dt className="text-text-muted">หมายเลขโทรศัพท์</dt>
                          <dd className="mt-1 break-words text-text">
                            {relationship.hospitalContact.contact.phoneNumber}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  )}
                </section>
              ) : null}
              <Link
                className="mt-4 inline-flex min-h-11 max-w-full items-center justify-center rounded-control bg-action-primary px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href={`/app/personal/profile/${encodeURIComponent(relationship.relationshipId)}`}
              >
                ดูและแก้ไขข้อมูลสำหรับโรงพยาบาลนี้
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-text-muted">
          ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย
        </p>
      )}
    </section>
  );
}
