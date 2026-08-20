import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function WorkforceDetailLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดรายละเอียดความสัมพันธ์บุคลากร..." />;
}
