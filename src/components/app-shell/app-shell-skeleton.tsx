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
          className="app-shell-header app-shell-horizontal-gutter flex min-h-app-header items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-8"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 lg:hidden">
              <p className="text-lg font-bold tracking-[-0.03em] text-text">DEMI</p>
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
            <div className="hidden min-w-0 lg:block">
              <Skeleton className="h-5 w-28 lg:h-4 lg:w-36" />
              <Skeleton className="mt-2 h-3 w-36" />
            </div>
          </div>
          <Skeleton className="hidden h-10 w-24 shrink-0 lg:block" />
        </header>

        <main className="app-shell-horizontal-gutter app-shell-main-content @container/workspace min-w-0 w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <PageHeaderSkeleton actions />
          <div className="grid gap-6 pt-8 lg:grid-cols-2">
            <PanelSkeleton rows={3} />
            <PanelSkeleton rows={3} />
            <PanelSkeleton className="lg:col-span-2" rows={4} />
          </div>
        </main>
      </div>
      <nav
        aria-hidden="true"
        className="app-mobile-bottom-navigation fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-surface lg:hidden"
      >
        <ul className="m-0 grid h-full list-none grid-cols-5 p-0">
          {Array.from({ length: 5 }, (_, index) => (
            <li className="flex flex-col items-center justify-center gap-1" key={index}>
              <Skeleton className="size-5" />
              <Skeleton className="h-3 w-10" />
            </li>
          ))}
        </ul>
      </nav>
    </LoadingRegion>
  );
}

export function MoreNavigationSkeleton(): React.JSX.Element {
  return (
    <div aria-busy="true" className="content-workspace break-words">
      <span className="sr-only" role="status">กำลังโหลดเมนูเพิ่มเติม...</span>
      <PageHeaderSkeleton />
      <section aria-hidden="true" className="space-y-3 border-b border-border py-6">
        <Skeleton className="h-6 w-48 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-20" />
        </div>
      </section>
      <div aria-hidden="true" className="space-y-8 pt-8">
        {Array.from({ length: 3 }, (_, groupIndex) => (
          <section className="space-y-3" key={groupIndex}>
            <Skeleton className="h-4 w-28" />
            <div className="divide-y divide-border border-y border-border">
              {Array.from({ length: groupIndex === 0 ? 4 : 3 }, (_, itemIndex) => (
                <div className="flex min-h-12 items-center gap-3 px-2 py-2" key={itemIndex}>
                  <Skeleton className="size-10 rounded-control" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="ml-auto size-4 rounded-full" />
                </div>
              ))}
            </div>
          </section>
        ))}
        <Skeleton className="h-12 w-full rounded-control" />
      </div>
    </div>
  );
}
