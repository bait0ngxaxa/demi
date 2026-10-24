import { PageHeader } from "@/components/ui/page-header";
import type { HospitalContentPatientDetail } from "@/modules/hospital-content/types/hospital-content-patient-projections";
import { PatientContentLink } from "./patient-content-link";
import { PatientContentAttribution, patientContentControlClass } from "./patient-content-presentation";
import { HospitalContentImageCarousel } from "@/components/hospital-content/hospital-content-image-carousel";

export function PatientContentDetail({ content }: { content: HospitalContentPatientDetail }): React.JSX.Element {
  return <article className="min-w-0 max-w-4xl space-y-8 [overflow-wrap:anywhere]">
    <PatientContentLink href={content.category === "NEWS" ? "/app/personal/news" : "/app/personal/knowledge"} className={patientContentControlClass}>{content.category === "NEWS" ? "กลับไปข่าวสาร" : "กลับไปสื่อความรู้"}</PatientContentLink>
    <PageHeader title={content.title} description={content.category === "NEWS" ? "ข่าวสารจากโรงพยาบาล" : "สื่อความรู้จากโรงพยาบาล"} />
    <PatientContentAttribution content={content} />
    <HospitalContentImageCarousel imageIds={content.imageIds} title={content.title} />
    <div className="max-w-prose whitespace-pre-wrap text-base leading-8 text-text">{content.body}</div>
    {content.sourceText !== null ? <section className="border-t border-border pt-6">
      <h2 className="text-lg font-semibold text-text">แหล่งที่มา / เอกสารอ้างอิง</h2>
      <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm leading-7 text-text-muted">{content.sourceText}</p>
    </section> : null}
    <p className="border-t border-border pt-6 text-sm leading-7 text-text-muted">โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา</p>
  </article>;
}
