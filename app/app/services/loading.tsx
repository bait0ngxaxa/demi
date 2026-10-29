import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function ServicesLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายการจัดบริการ..." />;
}
