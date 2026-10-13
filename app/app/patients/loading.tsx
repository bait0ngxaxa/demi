import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function PatientDirectoryLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายชื่อผู้ป่วย..." />;
}
