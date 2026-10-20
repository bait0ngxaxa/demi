import { LoadingRegion } from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientPersonalLoading(): React.JSX.Element {
  return (
    <LoadingRegion label="กำลังโหลดพื้นที่ส่วนตัว...">
      <div className="min-w-0 max-w-5xl">
        <Skeleton className="h-64 w-full rounded-panel" />
        <section aria-hidden="true" className="mt-7">
          <Skeleton className="h-7 w-28" />
          <ul className="mt-3 grid grid-cols-4 gap-1 sm:gap-3">
            {Array.from({ length: 8 }, (_, index) => (
              <li className="min-w-0" key={index}>
                <Skeleton className="h-20 w-full" />
              </li>
            ))}
          </ul>
        </section>
        <div aria-hidden="true" className="mt-8 space-y-4">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-36 w-full rounded-panel" />
          <Skeleton className="h-36 w-full rounded-panel" />
        </div>
      </div>
    </LoadingRegion>
  );
}
