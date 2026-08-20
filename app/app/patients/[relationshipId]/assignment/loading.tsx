import {
  LoadingRegion,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/ui/loading-skeletons";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientOsmAssignmentLoading(): React.JSX.Element {
  return (
    <LoadingRegion className="max-w-4xl" label="กำลังโหลดการมอบหมาย...">
      <PageHeaderSkeleton actions />
      <div className="space-y-6 pt-8">
        <PanelSkeleton rows={2} />
        <Panel aria-hidden="true">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-3 h-4 w-3/5" />
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_8rem] lg:items-end">
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
          <div className="mt-6 space-y-3 border-t border-border pt-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        </Panel>
      </div>
    </LoadingRegion>
  );
}
