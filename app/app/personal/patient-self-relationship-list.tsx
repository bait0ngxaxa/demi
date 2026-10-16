import { HospitalStatus } from "@prisma/client";
import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";

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
  showCareLink = false,
}: {
  relationships: readonly PatientSelfHospitalRelationship[];
  showCareLink?: boolean;
}): React.JSX.Element {
  return (
    <section aria-labelledby="patient-self-hospitals-heading" className="mt-8">
      <h2
        className="text-xl font-semibold tracking-[-0.02em] text-text"
        id="patient-self-hospitals-heading"
      >
        โรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย
      </h2>
      {showCareLink ? <p className="mt-2 text-sm leading-6 text-text-muted">ข้อมูลการดูแลและข้อมูลส่วนตัวแยกตามโรงพยาบาล เลือกโรงพยาบาลที่ต้องการดูหรือติดต่อ</p> : null}
      {relationships.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {relationships.map((relationship) => (
            <li
              className="min-w-0 py-4"
              key={relationship.relationshipId}
            >
              <h3 className="break-words font-semibold text-text">{relationship.hospitalName}</h3>
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                ข้อมูลนี้ใช้สำหรับโรงพยาบาลนี้
              </p>
              <dl className="mt-2 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
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
              <nav aria-label={`ข้อมูลของฉันที่ ${relationship.hospitalName}`} className="mt-4 flex flex-wrap gap-3">
                {showCareLink ? (
                  <Link
                    className={buttonClassName({ className: "w-full max-w-full break-words text-center sm:w-auto" })}
                    href={`/app/personal/care/${encodeURIComponent(relationship.relationshipId)}`}
                    prefetch={false}
                  >
                    ข้อมูลการดูแลของโรงพยาบาลนี้
                    <span className="sr-only"> · {relationship.hospitalName}</span>
                  </Link>
                ) : null}
                <Link
                  className={buttonClassName({ variant: showCareLink ? "secondary" : "primary", className: "w-full max-w-full break-words text-center sm:w-auto" })}
                  href={`/app/personal/profile/${encodeURIComponent(relationship.relationshipId)}`}
                  prefetch={false}
                >
                  ดูและแก้ไขข้อมูลสำหรับโรงพยาบาลนี้
                  <span className="sr-only"> · {relationship.hospitalName}</span>
                </Link>
              </nav>
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
