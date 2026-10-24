import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientWorkflowLoading(): React.JSX.Element {
  return (
    <LoadingRegion className="content-detail" label="กำลังโหลดข้อมูลผู้ป่วย...">
      <PageHeaderSkeleton />
      <div className="mt-6 space-y-5">
        <PanelSkeleton rows={2} />
        <PanelSkeleton rows={2} />
        <div aria-hidden="true" className="flex gap-3 overflow-hidden border-b border-border pb-2">
          <span className="h-10 w-20 shrink-0 animate-pulse rounded-control bg-surface-muted" />
          <span className="h-10 w-20 shrink-0 animate-pulse rounded-control bg-surface-muted" />
          <span className="h-10 w-28 shrink-0 animate-pulse rounded-control bg-surface-muted" />
        </div>
        <PanelSkeleton rows={5} />
      </div>
    </LoadingRegion>
  );
}
