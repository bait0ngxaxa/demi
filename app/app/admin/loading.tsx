import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function AdminDirectoryLoading(): React.JSX.Element {
  return <DirectorySkeleton label="กำลังโหลดข้อมูลการกำกับดูแล..." rows={6} />;
}
