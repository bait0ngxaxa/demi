import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function ProgramRoundsLoading(): React.JSX.Element {
  return <DetailSkeleton className="w-full" label="กำลังโหลดภาพรวมการจัดบริการ..." />;
}
