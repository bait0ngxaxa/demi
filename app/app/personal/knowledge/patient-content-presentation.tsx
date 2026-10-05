import { buttonClassName } from "@/components/ui/button";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentPatientListItem } from "@/modules/hospital-content/types/hospital-content-patient-projections";

export const patientContentControlClass = buttonClassName({ variant: "secondary", size: "compact", className: "max-w-full" });

export function PatientContentAttribution({ content }: { content: HospitalContentPatientListItem }): React.JSX.Element {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(new Date(content.latestPublishedAt));
  return <div className="space-y-2 text-sm leading-6 text-text-muted [overflow-wrap:anywhere]">
    <p>{HOSPITAL_CONTENT_CATEGORY_LABELS[content.category]}</p>
    <p className="font-medium text-text">{content.hospital.name} <span className="font-normal text-text-muted">({content.hospital.hospitalCode})</span></p>
    <p>เผยแพร่ล่าสุด <time dateTime={content.latestPublishedAt}>{formatted}</time></p>
  </div>;
}
