import type { AppointmentContactPhones } from "@/modules/appointments/domain/appointment-contact-phones";

function PhoneValue({ phone, missing }: { phone: string | null; missing: string }): React.JSX.Element {
  if (!phone) return <dd className="mt-1 text-text-muted">{missing}</dd>;
  return (
    <dd className="mt-1 font-semibold">
      <a
        className="inline-flex min-h-11 items-center break-all text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={`tel:${phone.replace(/[^\d+]/gu, "")}`}
      >
        {phone}
      </a>
    </dd>
  );
}

/**
 * E4 (ก-20) entries for an appointment detail <dl>. The server projection decides what is present:
 * `patientPhone` is only ever non-null for the assigned OSM and Hospital staff.
 */
export function AppointmentContactPhoneEntries({
  contactPhones,
  showPatientPhone,
}: {
  contactPhones: AppointmentContactPhones;
  showPatientPhone: boolean;
}): React.JSX.Element {
  return (
    <>
      <div className="min-w-0">
        <dt className="text-sm text-text-muted">เบอร์ติดต่อโรงพยาบาล</dt>
        <PhoneValue missing="โรงพยาบาลยังไม่ได้ระบุเบอร์ติดต่อ" phone={contactPhones.hospitalPhone} />
      </div>
      {contactPhones.assignedOsmPhone ? <div className="min-w-0">
        <dt className="text-sm text-text-muted">เบอร์ติดต่อ อสม. ที่ดูแลปัจจุบัน</dt>
        <PhoneValue missing="ยังไม่มีเบอร์ติดต่อ อสม." phone={contactPhones.assignedOsmPhone} />
      </div> : null}
      {showPatientPhone ? (
        <div className="min-w-0">
          <dt className="text-sm text-text-muted">เบอร์ติดต่อผู้ป่วย</dt>
          <PhoneValue missing="ยังไม่มีเบอร์ติดต่อผู้ป่วย" phone={contactPhones.patientPhone} />
        </div>
      ) : null}
    </>
  );
}
