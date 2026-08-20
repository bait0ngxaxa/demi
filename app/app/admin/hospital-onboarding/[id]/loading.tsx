import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalOnboardingDetailLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดรายละเอียดคำขอขึ้นทะเบียน..." />;
}
