import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientProvisioningLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดหน้าเพิ่มผู้ป่วย..." sections={2} />;
}
