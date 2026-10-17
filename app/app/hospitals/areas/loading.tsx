import { PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function ParentAreaOverviewLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดเขตความรับผิดชอบ" className="content-workspace">
      <PageHeaderSkeleton />
      <PanelSkeleton className="mt-6" rows={5} />
      <PanelSkeleton className="mt-5" rows={5} />
    </div>
  );
}
