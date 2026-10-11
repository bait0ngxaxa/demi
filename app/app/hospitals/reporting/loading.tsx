import { PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalReportingLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดรายงานโรงพยาบาล" className="max-w-6xl">
      <PageHeaderSkeleton actions />
      <PanelSkeleton className="mt-6" rows={4} />
      <PanelSkeleton className="mt-5" rows={7} />
    </div>
  );
}
