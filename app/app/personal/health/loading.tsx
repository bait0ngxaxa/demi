import { LoadingRegion } from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientHealthLoading(): React.JSX.Element {
  return <LoadingRegion label="กำลังโหลดข้อมูลสุขภาพ...">
    <div className="min-w-0 max-w-4xl space-y-6" aria-hidden="true">
      <Skeleton className="h-10 w-48" /><Skeleton className="h-12 w-full" />
      <Skeleton className="h-48 w-full rounded-panel" /><Skeleton className="h-64 w-full rounded-panel" />
    </div>
  </LoadingRegion>;
}
