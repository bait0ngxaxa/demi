import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getHospitalWorkContactsPageContext } from "@/modules/hospital-contact/transport/hospital-contact-work-page-context";

export const metadata: Metadata = { title: "ติดต่อโรงพยาบาล" };

export default async function HospitalWorkContactsPage(): Promise<React.JSX.Element> {
  await connection();
  const contacts = await getHospitalWorkContactsPageContext();

  return (
    <div className="min-w-0 max-w-5xl space-y-6">
      <PageHeader
        title="ติดต่อโรงพยาบาล"
        description="ที่อยู่และหมายเลขโทรศัพท์ของโรงพยาบาลที่สัมพันธ์กับบัญชีงานของคุณ"
      />

      {contacts.length === 0 ? (
        <p className="rounded-panel border border-border p-5 text-text-muted">
          ไม่พบโรงพยาบาลที่มีความสัมพันธ์ที่ใช้งานได้
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((contact) => (
            <li className="min-w-0 py-5 first:pt-0" key={contact.hospital.hospitalCode}>
              <h2 className="break-words text-lg font-semibold text-text">{contact.hospital.name}</h2>
              <p className="mt-1 text-sm text-text-muted">รหัสโรงพยาบาล {contact.hospital.hospitalCode}</p>

              {contact.availability === "UNAVAILABLE" ? (
                <p className="mt-4 text-text-muted">ยังไม่ได้ระบุข้อมูลติดต่อ</p>
              ) : (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {contact.addressText ? (
                    <div className="min-w-0">
                      <dt className="text-sm font-semibold text-text">ที่อยู่</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-text-muted">{contact.addressText}</dd>
                    </div>
                  ) : null}
                  {contact.phoneNumber ? (
                    <div className="min-w-0">
                      <dt className="text-sm font-semibold text-text">โทรศัพท์</dt>
                      <dd className="mt-1">
                        <a
                          aria-label={`โทร ${contact.hospital.name} ${contact.phoneNumber}`}
                          className="inline-flex min-h-11 items-center break-all font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                          href={`tel:${contact.phoneNumber}`}
                        >
                          {contact.phoneNumber}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
