import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientSelfProgramLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดข้อมูล Program..." />;
}
