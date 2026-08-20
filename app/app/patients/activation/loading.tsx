import {
  LoadingRegion,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/ui/loading-skeletons";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientActivationWorkspaceLoading(): React.JSX.Element {
  return (
    <LoadingRegion className="max-w-6xl" label="กำลังโหลดพื้นที่เปิดใช้งานบัญชีผู้ป่วย...">
      <PageHeaderSkeleton />
      <div className="space-y-6 pt-8">
        <PanelSkeleton rows={2} />
        <Panel aria-hidden="true">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-3 h-4 w-3/5" />
          <div className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_8rem] lg:items-end">
            <div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="mt-6 h-28 w-full" />
        </Panel>
      </div>
    </LoadingRegion>
  );
}
