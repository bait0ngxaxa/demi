import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function ProgramReportLoading(): React.JSX.Element {
  return <DetailSkeleton className="w-full" label="กำลังโหลดรายงานข้อมูลโปรแกรม..." />;
}
