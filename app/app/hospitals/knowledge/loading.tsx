import { PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalContentLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดข่าวสารและความรู้" className="max-w-5xl">
      <PageHeaderSkeleton actions />
      <PanelSkeleton className="mt-6" rows={5} />
    </div>
  );
}
