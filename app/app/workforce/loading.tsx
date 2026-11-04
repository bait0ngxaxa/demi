import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function WorkforceDirectoryLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายชื่อเจ้าหน้าที่และ อสม.…" rows={6} />;
}
