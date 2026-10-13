import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function WorkforceDirectoryLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายชื่อบุคลากร..." rows={6} />;
}
