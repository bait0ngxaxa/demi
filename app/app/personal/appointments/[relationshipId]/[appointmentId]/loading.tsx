import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientSelfAppointmentDetailLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดรายละเอียดนัดหมาย..." />;
}
