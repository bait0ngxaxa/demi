import { buttonClassName } from "@/components/ui/button";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentPatientListItem } from "@/modules/hospital-content/types/hospital-content-patient-projections";

export const patientContentControlClass = buttonClassName({ variant: "secondary", size: "compact", className: "max-w-full" });

export function PatientContentAttribution({ content }: { content: HospitalContentPatientListItem }): React.JSX.Element {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(new Date(content.latestPublishedAt));
  return <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm leading-6 text-text-muted [overflow-wrap:anywhere] sm:grid-cols-2">
    <div className="min-w-0">
      <dt>โรงพยาบาล</dt>
      <dd className="mt-0.5 font-medium text-text">{content.hospital.name}</dd>
    </div>
    <div className="min-w-0">
      <dt>หมวดหมู่</dt>
      <dd className="mt-0.5 text-text">{HOSPITAL_CONTENT_CATEGORY_LABELS[content.category]}</dd>
    </div>
    <div className="min-w-0">
      <dt>เผยแพร่ล่าสุด</dt>
      <dd className="mt-0.5 text-text"><time dateTime={content.latestPublishedAt}>{formatted}</time></dd>
    </div>
  </dl>;
}
