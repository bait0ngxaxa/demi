import { PublicFormSkeleton } from "@/components/ui/loading-skeletons";

export default function HospitalOnboardingLoading(): React.JSX.Element {
  return <PublicFormSkeleton label="กำลังโหลดแบบฟอร์มลงทะเบียนโรงพยาบาล..." variant="wide" />;
}
