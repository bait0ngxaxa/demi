import {
  LoadingRegion,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/ui/loading-skeletons";

export default function ApplicationLoading(): React.JSX.Element {
  return (
    <LoadingRegion className="content-workspace" label="กำลังโหลดข้อมูล...">
      <PageHeaderSkeleton actions />
      <div className="grid gap-6 pt-8 @5xl/workspace:grid-cols-2">
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={3} />
        <PanelSkeleton className="@5xl/workspace:col-span-2" rows={4} />
      </div>
    </LoadingRegion>
  );
}
