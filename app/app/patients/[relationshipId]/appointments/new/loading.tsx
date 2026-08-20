import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function NewAppointmentLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดแบบฟอร์มนัดหมาย..." sections={2} />;
}
