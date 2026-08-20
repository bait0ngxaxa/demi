import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalGovernanceDetailLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดรายละเอียดการกำกับดูแลโรงพยาบาล..." />;
}
