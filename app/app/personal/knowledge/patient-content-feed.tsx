import { HospitalContentCategory } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
import { PatientContentLink } from "./patient-content-link";
import { PatientContentAttribution, patientContentControlClass } from "./patient-content-presentation";
import { HospitalContentImageList } from "../../hospitals/content/hospital-content-image-list";

const knowledgeBase = "/app/personal/knowledge";
const knowledgeCategories = [HospitalContentCategory.NCD, HospitalContentCategory.FOOD, HospitalContentCategory.EXERCISE, HospitalContentCategory.OTHER] as const;
export function PatientContentFeed({ context, kind = "KNOWLEDGE" }: {
  context: HospitalContentPatientFeedContext;
  kind?: "NEWS" | "KNOWLEDGE";
}): React.JSX.Element {
  const title = kind === "NEWS" ? "ข่าวสาร" : "สื่อความรู้";
  const feedBase = kind === "NEWS" ? "/app/personal/news" : knowledgeBase;
  const emptyCopy = {
    EMPTY_A: `ยังไม่มีโรงพยาบาลที่พร้อมแสดง${title}`,
    EMPTY_B: `ยังไม่มี${title}จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ`,
    EMPTY_C: `ยังไม่มี${title}ในหมวดหมู่นี้`,
  };
  const breadcrumbs = <nav aria-label="ลำดับหน้า">
    <ol className="flex flex-wrap items-center gap-2 text-sm leading-6 text-text-muted">
      <li><PatientContentLink href="/app/personal" className={patientContentControlClass}>พื้นที่ส่วนตัว</PatientContentLink></li>
      <li><span aria-hidden="true">/ </span><span aria-current="page">{title}</span></li>
    </ol>
  </nav>;
  if (context.outcome === "VALIDATION") return <div className="min-w-0 max-w-4xl space-y-6">
    {breadcrumbs}
    <PageHeader title={title} description={kind === "NEWS" ? "ประกาศจากโรงพยาบาล" : "เนื้อหาให้ความรู้จากโรงพยาบาล"} />
    <Alert variant="warning">ไม่สามารถเปิดหน้ารายการที่ขอได้ กรุณาโหลดรายการล่าสุด</Alert>
    <PatientContentLink href={feedBase} className={patientContentControlClass}>โหลดรายการล่าสุด</PatientContentLink>
  </div>;

  const { page } = context;
  const continuation = new URLSearchParams();
  if (kind === "NEWS") continuation.set("category", HospitalContentCategory.NEWS);
  else if (page.category !== null) continuation.set("category", page.category);
  if (page.nextCursor !== null) continuation.set("cursor", page.nextCursor);

  return <div className="min-w-0 max-w-4xl space-y-8">
    {breadcrumbs}
    <PageHeader title={title} description={kind === "NEWS" ? "ประกาศจากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ" : "เนื้อหาให้ความรู้จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ"} />
    {kind === "NEWS" ? <PatientContentLink href={knowledgeBase} className={patientContentControlClass}>ไปที่สื่อความรู้</PatientContentLink> : (
      <nav aria-label="เลือกหมวดหมู่สื่อความรู้" className="flex flex-wrap gap-2">
        <PatientContentLink href={knowledgeBase} current={page.category === null} className={patientContentControlClass}>{page.category === null ? "ทุกหมวดหมู่ (เลือกอยู่)" : "ทุกหมวดหมู่"}</PatientContentLink>
        {knowledgeCategories.map((category) => <form action={knowledgeBase} method="get" key={category}>
          <button type="submit" name="category" value={category} aria-pressed={page.category === category} className={patientContentControlClass}>
            {HOSPITAL_CONTENT_CATEGORY_LABELS[category]}{page.category === category ? " (เลือกอยู่)" : ""}
          </button>
        </form>)}
      </nav>
    )}
    {page.emptyState !== null ? <Alert variant="neutral">
      <p>{emptyCopy[page.emptyState]}</p>
      {page.emptyState === "EMPTY_C" ? <PatientContentLink href={feedBase} className={`${patientContentControlClass} mt-4`}>ดูรายการทั้งหมด</PatientContentLink> : null}
    </Alert> : <ul className="space-y-4" aria-label={`รายการ${title}`}>
      {page.items.map((content) => <li key={content.id} className="min-w-0 rounded-panel border border-border bg-surface p-5 sm:p-7">
        <h2 className="mb-4 text-xl font-semibold leading-8 [overflow-wrap:anywhere]">
          <PatientContentLink href={`${knowledgeBase}/${content.id}`} className="block min-h-11 rounded-control text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">{content.title}</PatientContentLink>
        </h2>
        <HospitalContentImageList imageIds={content.imageIds.slice(0, 1)} title={content.title} />
        <PatientContentAttribution content={content} />
      </li>)}
    </ul>}
    <nav aria-label={`หน้ารายการ${title}`} className="flex flex-wrap gap-3">
      {page.nextCursor !== null ? <PatientContentLink href={`${feedBase}?${continuation}`} className={patientContentControlClass}>หน้าถัดไป</PatientContentLink> : null}
      <PatientContentLink href={feedBase} className={patientContentControlClass}>โหลดรายการล่าสุด</PatientContentLink>
    </nav>
  </div>;
}
