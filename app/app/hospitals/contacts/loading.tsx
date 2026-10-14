import { Panel } from "@/components/ui/panel";

export default function HospitalWorkContactsLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดข้อมูลติดต่อโรงพยาบาล" className="max-w-5xl">
      <div className="border-b border-border pb-8">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-4 h-6 w-full max-w-xl animate-pulse rounded-control bg-surface-muted" />
      </div>
      <Panel className="mt-6">
        <div className="h-6 w-56 max-w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-4 h-4 w-32 max-w-full animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-6 h-12 w-full animate-pulse rounded-control bg-surface-muted" />
      </Panel>
    </div>
  );
}
