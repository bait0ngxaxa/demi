import { DetailSkeleton } from "@/components/ui/loading-skeletons";

export default function UserDetailLoading(): React.JSX.Element {
  return <DetailSkeleton label="กำลังโหลดรายละเอียดผู้ใช้งาน..." />;
}
