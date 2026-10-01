import {
  DirectorySkeleton,
} from "@/components/ui/loading-skeletons";

export default function HospitalPatientServiceRequestsLoading(): React.JSX.Element {
  return <DirectorySkeleton label="กำลังโหลดคำขอบริการผู้ป่วย..." rows={4} />;
}
