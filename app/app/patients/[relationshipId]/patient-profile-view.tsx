import { Panel } from "@/components/ui/panel";
import type { PatientProfileDetail } from "@/modules/patient-directory/services/patient-directory-query-service";

type ProfileField = {
  label: string;
  value: string;
  wide?: boolean;
};

function displayText(value: string | null): string {
  const normalized = value?.trim();

  return normalized || "ไม่ระบุ";
}

function formatDateOnly(value: Date | null): string {
  if (!value) {
    return "ไม่ระบุ";
  }

  const calendarDate = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(calendarDate);
}

function ProfileSection({
  fields,
  title,
}: {
  fields: readonly ProfileField[];
  title: string;
}): React.JSX.Element {
  return (
    <section>
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">{title}</h3>
      <dl className="mt-4 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
        {fields.map((field) => (
          <div className={field.wide ? "min-w-0 sm:col-span-2" : "min-w-0"} key={field.label}>
            <dt className="text-sm font-semibold text-text-muted">{field.label}</dt>
            <dd className="mt-1 break-words text-base font-semibold leading-7 text-text">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PatientProfileView({
  profile,
}: {
  profile: PatientProfileDetail;
}): React.JSX.Element {
  return (
    <section aria-labelledby="patient-profile-heading" className="mt-6">
      <Panel>
        <h2
          className="text-2xl font-semibold tracking-[-0.03em] text-text"
          id="patient-profile-heading"
        >
          ข้อมูลผู้ป่วย
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          ข้อมูลโปรไฟล์ส่วนนี้แสดงแบบอ่านอย่างเดียวสำหรับการตรวจสอบความต้องการ
        </p>

        <div className="mt-7 grid gap-8 border-t border-border pt-7">
          <ProfileSection
            fields={[
              { label: "วันเกิด", value: formatDateOnly(profile.dateOfBirth) },
              { label: "เพศ", value: displayText(profile.gender) },
            ]}
            title="ข้อมูลทั่วไป"
          />
          <ProfileSection
            fields={[
              { label: "เบอร์โทรศัพท์", value: displayText(profile.phoneNumber) },
              { label: "ที่อยู่", value: displayText(profile.addressText), wide: true },
            ]}
            title="ข้อมูลติดต่อ"
          />
          <ProfileSection
            fields={[
              { label: "ชื่อผู้ติดต่อ", value: displayText(profile.emergencyContactName) },
              { label: "เบอร์โทรศัพท์", value: displayText(profile.emergencyContactPhone) },
            ]}
            title="ผู้ติดต่อกรณีฉุกเฉิน"
          />
          <ProfileSection
            fields={[
              { label: "อาชีพ", value: displayText(profile.occupation) },
              { label: "ระดับการศึกษา", value: displayText(profile.educationLevel) },
            ]}
            title="ข้อมูลพื้นฐาน"
          />
        </div>
      </Panel>
    </section>
  );
}
