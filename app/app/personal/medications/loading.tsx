import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function PersonalMedicationLoading(): React.JSX.Element {
  return <LoadingRegion label="กำลังโหลดรายการยาของฉัน..."><div className="max-w-4xl"><PageHeaderSkeleton /><div className="mt-6 space-y-6"><PanelSkeleton rows={4} /><PanelSkeleton rows={4} /></div></div></LoadingRegion>;
}
