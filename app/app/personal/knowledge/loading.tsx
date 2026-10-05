import { PageHeader } from "@/components/ui/page-header";

export default function PatientKnowledgeLoading(): React.JSX.Element {
  return <div className="min-w-0 max-w-4xl space-y-6">
    <PageHeader title="ข่าวสารและความรู้" description="ข่าวสารและความรู้ที่จัดทำโดยโรงพยาบาล" />
    <p role="status" className="text-text-muted">กำลังโหลดข่าวสารและความรู้…</p>
  </div>;
}
