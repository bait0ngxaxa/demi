import { PublicFormSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalOnboardingLoading(): React.JSX.Element {
  return <PublicFormSkeleton label="กำลังโหลดแบบฟอร์มขอใช้งาน DEMI..." variant="wide" />;
}
