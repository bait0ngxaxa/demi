import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function PatientSelfCareLoading(): React.JSX.Element {
  return (
    <DirectorySkeleton
      label="กำลังโหลดข้อมูลการดูแล..."
      rows={4}
    />
  );
}
