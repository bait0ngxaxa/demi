import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function PatientSelfAppointmentsLoading(): React.JSX.Element {
  return (
    <DirectorySkeleton
      label="กำลังโหลดรายการนัดหมาย..."
      rows={4}
    />
  );
}
