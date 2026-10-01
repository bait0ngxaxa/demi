import { PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function FamilyManagementLoading(): React.JSX.Element {
  return (
    <div className="max-w-4xl space-y-6" aria-busy="true">
      <PageHeaderSkeleton />
      <PanelSkeleton />
      <PanelSkeleton />
    </div>
  );
}
