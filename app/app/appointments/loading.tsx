import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function WorkAppointmentLoading(): React.JSX.Element {
  return <DirectorySkeleton className="content-workspace" label="กำลังโหลดรายการนัดหมาย..." />;
}
