import {
  LoadingRegion,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const sidebarItemWidths = ["w-44", "w-36", "w-48"] as const;

function SidebarNavigationSkeleton(): React.JSX.Element {
  return (
    <div className="flex-1 space-y-8 px-4 py-6">
      {Array.from({ length: 2 }, (_, groupIndex) => (
        <div className="space-y-3" key={groupIndex}>
          <Skeleton className="h-3 w-24" tone="inverse" />
          {sidebarItemWidths.map((width, itemIndex) => (
            <Skeleton
              className={`h-10 ${width} max-w-full`}
              key={itemIndex}
              tone="inverse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ProtectedApplicationShellSkeleton(): React.JSX.Element {
  return (
    <LoadingRegion
      className="min-h-svh bg-canvas text-text lg:flex"
      label="กำลังเตรียมพื้นที่ใช้งาน..."
    >
      <aside
        aria-hidden="true"
        className="hidden h-svh w-app-sidebar shrink-0 bg-navigation-background lg:flex lg:flex-col"
      >
        <div className="flex h-28 shrink-0 flex-col justify-center border-b border-white/12 px-5">
          <Skeleton className="h-8 w-24" tone="inverse" />
          <Skeleton className="mt-3 h-4 w-40" tone="inverse" />
        </div>
        <SidebarNavigationSkeleton />
      </aside>

      <div className="min-w-0 flex-1">
        <header
          aria-hidden="true"
          className="flex min-h-app-header items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-8"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-10 shrink-0 lg:hidden" />
            <div className="min-w-0">
              <Skeleton className="h-5 w-28 lg:h-4 lg:w-36" />
              <Skeleton className="mt-2 h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-10 w-24 shrink-0" />
        </header>

        <main className="min-w-0 w-full px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <PageHeaderSkeleton actions />
          <div className="grid gap-6 pt-8 lg:grid-cols-2">
            <PanelSkeleton rows={3} />
            <PanelSkeleton rows={3} />
            <PanelSkeleton className="lg:col-span-2" rows={4} />
          </div>
        </main>
      </div>
    </LoadingRegion>
  );
}
