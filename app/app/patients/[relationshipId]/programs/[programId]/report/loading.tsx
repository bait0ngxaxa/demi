import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function ProgramReportLoading(): React.JSX.Element {
  return <DetailSkeleton className="max-w-5xl" label="กำลังโหลดรายงานข้อมูลโปรแกรม..." />;
}
