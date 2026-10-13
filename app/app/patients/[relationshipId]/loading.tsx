import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientWorkflowLoading(): React.JSX.Element {
  return (
    <LoadingRegion className="content-detail" label="กำลังโหลดข้อมูลผู้ป่วย...">
      <PageHeaderSkeleton />
      <div className="grid min-w-0 gap-6 pt-8 @5xl/workspace:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] @5xl/workspace:items-start">
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={4} />
        <PanelSkeleton className="@5xl/workspace:col-span-2" rows={4} />
      </div>
    </LoadingRegion>
  );
}
