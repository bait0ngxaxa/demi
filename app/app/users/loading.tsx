import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function UsersDirectoryLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายชื่อผู้ใช้งาน..." rows={6} />;
}
