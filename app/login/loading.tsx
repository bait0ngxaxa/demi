import { PublicFormSkeleton } from "@/components/ui/loading-skeletons";

export default function LoginLoading(): React.JSX.Element {
  return <PublicFormSkeleton label="กำลังโหลดหน้าเข้าสู่ระบบ..." />;
}
