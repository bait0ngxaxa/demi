import { Panel } from "@/components/ui/panel";

export default function HospitalContactLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดข้อมูลติดต่อโรงพยาบาล" className="max-w-3xl">
      <div className="border-b border-border pb-8">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-4 h-6 w-full max-w-xl animate-pulse rounded-control bg-surface-muted" />
      </div>
      <Panel className="mt-6">
        <div className="h-6 w-48 max-w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-6 h-12 w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-6 h-32 w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-6 h-12 w-full animate-pulse rounded-control bg-surface-muted" />
      </Panel>
    </div>
  );
}
