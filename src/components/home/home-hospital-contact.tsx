import type { PatientHospitalContactProjection } from "@/modules/hospital-contact/types/hospital-contact-projections";

export function HomeHospitalContact({
  contact,
  hospitalName,
}: {
  contact: PatientHospitalContactProjection;
  hospitalName: string;
}): React.JSX.Element {
  return (
    <section aria-labelledby="personal-hospital-contact-heading" className="mt-8 min-w-0 border-t border-border pt-6" id="personal-hospital-contact">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="personal-hospital-contact-heading">
        ติดต่อโรงพยาบาล
      </h2>
      <p className="mt-1 break-words text-sm leading-6 text-text-muted">{hospitalName}</p>
      {contact.addressText === null && contact.phoneNumber === null ? (
        <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีข้อมูลติดต่อ</p>
      ) : (
        <address className="mt-3 grid min-w-0 gap-4 not-italic sm:grid-cols-2">
          {contact.addressText !== null ? (
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-text-muted">ที่อยู่</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text">{contact.addressText}</p>
            </div>
          ) : null}
          {contact.phoneNumber !== null ? (
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-text-muted">หมายเลขโทรศัพท์</h3>
              <a
                className="mt-1 inline-flex min-h-12 max-w-full items-center break-words rounded-control text-sm text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={`tel:${contact.phoneNumber}`}
              >
                {contact.phoneNumber}
              </a>
            </div>
          ) : null}
        </address>
      )}
    </section>
  );
}
