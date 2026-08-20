import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientWorkflowLoading(): React.JSX.Element {
  return <DetailSkeleton className="max-w-6xl" label="กำลังโหลดข้อมูลผู้ป่วย..." />;
}
