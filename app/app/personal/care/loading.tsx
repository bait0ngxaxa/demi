import { DirectorySkeleton } from "@/components/ui/loading-skeletons";

export default function PatientSelfCareLoading(): React.JSX.Element {
  return (
    <DirectorySkeleton
      label="กำลังโหลดบริการ..."
      rows={4}
    />
  );
}
