import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getHospitalWorkContentDetailContext } from "@/modules/hospital-content/transport/hospital-content-work-page-context";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import { HospitalContentImageList } from "../hospital-content-image-list";

export const metadata: Metadata = { title: "เนื้อหาจากโรงพยาบาล" };

export default async function HospitalWorkContentDetailPage({ params }: { params: Promise<{ contentId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const content = await getHospitalWorkContentDetailContext((await params).contentId);
  return <article className="min-w-0 max-w-4xl space-y-6 [overflow-wrap:anywhere]">
    <Link className="inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href="/app/hospitals/content">กลับไปยังเนื้อหา</Link>
    <PageHeader title={content.title} description={`${content.hospital.name} · ${HOSPITAL_CONTENT_CATEGORY_LABELS[content.category]}`} />
    <HospitalContentImageList imageIds={content.imageIds} title={content.title} />
    <div className="max-w-prose whitespace-pre-wrap text-base leading-8 text-text">{content.body}</div>
    {content.sourceText ? <section className="border-t border-border pt-5"><h2 className="font-semibold text-text">แหล่งข้อมูล</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-muted">{content.sourceText}</p></section> : null}
  </article>;
}
