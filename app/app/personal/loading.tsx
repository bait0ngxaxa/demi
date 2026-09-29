import {
  LoadingRegion,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/ui/loading-skeletons";

export default function PatientPersonalLoading(): React.JSX.Element {
  return (
    <LoadingRegion label="กำลังโหลดข้อมูลส่วนตัว...">
      <div className="max-w-4xl">
        <PageHeaderSkeleton actions />
        <div className="mt-6 space-y-6">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </LoadingRegion>
  );
}
