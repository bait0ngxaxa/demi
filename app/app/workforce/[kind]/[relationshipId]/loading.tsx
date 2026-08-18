import { Panel } from "@/components/ui/panel";

export default function WorkforceDetailLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="max-w-5xl">
      <Panel>
        <p className="text-sm text-text-muted">กำลังโหลดรายละเอียดความสัมพันธ์บุคลากร...</p>
        <div className="mt-5 h-8 w-2/3 animate-pulse rounded-control bg-surface-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-16 animate-pulse rounded-control bg-surface-muted" />
        </div>
      </Panel>
    </div>
  );
}
