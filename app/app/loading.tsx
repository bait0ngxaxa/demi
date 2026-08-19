import { Panel } from "@/components/ui/panel";

export default function ApplicationLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-live="polite" className="max-w-6xl">
      <div className="border-b border-border pb-7">
        <div className="h-10 w-64 animate-pulse rounded-control bg-border" />
        <p className="mt-4 text-sm text-text-muted">กำลังโหลดข้อมูล...</p>
      </div>
      <div className="space-y-6 pt-8">
        <Panel>
          <div className="h-6 w-1/2 animate-pulse rounded-control bg-surface-muted" />
          <div className="mt-4 h-4 w-3/4 animate-pulse rounded-control bg-surface-muted" />
          <div className="mt-6 h-12 animate-pulse rounded-control bg-surface-muted" />
        </Panel>
        <div className="h-56 animate-pulse rounded-panel border border-border bg-surface" />
      </div>
    </div>
  );
}
