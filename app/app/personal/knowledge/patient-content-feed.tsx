import { HospitalContentCategory } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
import { PatientContentLink } from "./patient-content-link";
import { PatientContentAttribution, patientContentControlClass } from "./patient-content-presentation";

const base = "/app/personal/knowledge";
const emptyCopy = {
  EMPTY_A: "ยังไม่มีโรงพยาบาลที่พร้อมแสดงข่าวสารและความรู้",
  EMPTY_B: "ยังไม่มีข่าวสารและความรู้จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ",
  EMPTY_C: "ยังไม่มีข่าวสารและความรู้ในหมวดหมู่นี้",
};
export function PatientContentFeed({ context }: { context: HospitalContentPatientFeedContext }): React.JSX.Element {
  if (context.outcome === "VALIDATION") return <div className="min-w-0 max-w-4xl space-y-6">
    <PageHeader title="ข่าวสารและความรู้" description="ข่าวสารและความรู้ที่จัดทำโดยโรงพยาบาล" />
    <Alert variant="warning">ไม่สามารถเปิดหน้ารายการที่ขอได้ กรุณาโหลดรายการล่าสุด</Alert>
    <PatientContentLink href={base} className={patientContentControlClass}>โหลดรายการล่าสุด</PatientContentLink>
  </div>;
  const { page } = context;
  const continuation = new URLSearchParams();
  if (page.category !== null) continuation.set("category", page.category);
  if (page.nextCursor !== null) continuation.set("cursor", page.nextCursor);
  return <div className="min-w-0 max-w-4xl space-y-8">
    <PageHeader title="ข่าวสารและความรู้" description="ข่าวสารและความรู้ที่จัดทำโดยโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ" />
    <nav aria-label="เลือกหมวดหมู่ข่าวสารและความรู้" className="flex flex-wrap gap-2">
      <PatientContentLink href={base} current={page.category === null} className={patientContentControlClass}>{page.category === null ? "ทุกหมวดหมู่ (เลือกอยู่)" : "ทุกหมวดหมู่"}</PatientContentLink>
      {Object.values(HospitalContentCategory).map((category) => <form action={base} method="get" key={category}>
        <button type="submit" name="category" value={category} aria-pressed={page.category === category} className={patientContentControlClass}>
          {HOSPITAL_CONTENT_CATEGORY_LABELS[category]}{page.category === category ? " (เลือกอยู่)" : ""}
        </button>
      </form>)}
    </nav>
    {page.emptyState !== null ? <Alert variant="neutral">
      <p>{emptyCopy[page.emptyState]}</p>
      {page.emptyState === "EMPTY_C" ? <PatientContentLink href={base} className={`${patientContentControlClass} mt-4`}>ดูทุกหมวดหมู่</PatientContentLink> : null}
    </Alert> : <ul className="space-y-4" aria-label="รายการข่าวสารและความรู้">
      {page.items.map((content) => <li key={content.id} className="min-w-0 rounded-panel border border-border bg-surface p-5 sm:p-7">
        <h2 className="mb-4 text-xl font-semibold leading-8 [overflow-wrap:anywhere]">
          <PatientContentLink href={`${base}/${content.id}`} className="block min-h-11 rounded-control text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">{content.title}</PatientContentLink>
        </h2>
        <PatientContentAttribution content={content} />
      </li>)}
    </ul>}
    <nav aria-label="หน้ารายการข่าวสารและความรู้" className="flex flex-wrap gap-3">
      {page.nextCursor !== null ? <PatientContentLink href={`${base}?${continuation}`} className={patientContentControlClass}>หน้าถัดไป</PatientContentLink> : null}
      <PatientContentLink href={base} className={patientContentControlClass}>โหลดรายการล่าสุด</PatientContentLink>
    </nav>
  </div>;
}
