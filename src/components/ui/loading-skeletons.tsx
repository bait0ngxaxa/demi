import type { ReactNode } from "react";

import { classNames } from "./class-names";
import { Panel } from "./panel";
import { Skeleton } from "./skeleton";

type LoadingRegionProps = {
  children: ReactNode;
  className?: string;
  label: string;
};

export function LoadingRegion({
  children,
  className,
  label,
}: LoadingRegionProps): React.JSX.Element {
  return (
    <div aria-busy="true" className={className}>
      <p className="sr-only" role="status">
        {label}
      </p>
      {children}
    </div>
  );
}

export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }): React.JSX.Element {
  return (
    <header aria-hidden="true" className="border-b border-border pb-7">
      <Skeleton className="mb-4 h-4 w-36" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-4 w-3/5 max-w-lg" />
        </div>
        {actions ? <Skeleton className="h-9 w-28 shrink-0 rounded-full" /> : null}
      </div>
    </header>
  );
}

export function PanelSkeleton({
  className,
  rows = 3,
}: {
  className?: string;
  rows?: number;
}): React.JSX.Element {
  const rowCount = Math.max(1, Math.min(rows, 8));

  return (
    <Panel aria-hidden="true" className={className}>
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="mt-3 h-4 w-3/5" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rowCount }, (_, index) => (
          <Skeleton
            className={classNames("h-12", index === rowCount - 1 ? "w-4/5" : "w-full")}
            key={index}
          />
        ))}
      </div>
    </Panel>
  );
}

function FormPanelSkeleton(): React.JSX.Element {
  return (
    <Panel aria-hidden="true">
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="mt-3 h-4 w-3/5" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-12 w-full" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function FormSkeleton({
  className,
  label = "กำลังโหลดแบบฟอร์ม...",
  sections = 2,
}: {
  className?: string;
  label?: string;
  sections?: number;
} = {}): React.JSX.Element {
  const sectionCount = Math.max(1, Math.min(sections, 4));

  return (
    <LoadingRegion className={classNames("max-w-5xl", className)} label={label}>
      <PageHeaderSkeleton />
      <div className="space-y-6 pt-8">
        {Array.from({ length: sectionCount }, (_, index) => (
          <FormPanelSkeleton key={index} />
        ))}
        <div aria-hidden="true" className="flex justify-end border-t border-border pt-6">
          <Skeleton className="h-12 w-36" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function DirectorySkeleton({
  className,
  label = "กำลังโหลดรายการ...",
  rows = 5,
}: {
  className?: string;
  label?: string;
  rows?: number;
} = {}): React.JSX.Element {
  const rowCount = Math.max(3, Math.min(rows, 8));

  return (
    <LoadingRegion className={classNames("max-w-6xl", className)} label={label}>
      <PageHeaderSkeleton actions />
      <div className="space-y-6 pt-8">
        <Panel aria-hidden="true">
          <Skeleton className="h-6 w-44" />
          <div className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_8rem] lg:items-end">
            <div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </Panel>
        <Panel aria-hidden="true">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {Array.from({ length: rowCount }, (_, index) => (
              <div className="grid min-h-20 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_10rem_7rem] sm:items-center" key={index}>
                <div>
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-2/5" />
                </div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </LoadingRegion>
  );
}

export function DetailSkeleton({
  className,
  label = "กำลังโหลดรายละเอียด...",
}: {
  className?: string;
  label?: string;
} = {}): React.JSX.Element {
  return (
    <LoadingRegion className={classNames("max-w-5xl", className)} label={label}>
      <PageHeaderSkeleton actions />
      <div className="space-y-6 pt-8">
        <Panel aria-hidden="true">
          <Skeleton className="h-6 w-2/5" />
          <div className="mt-6 grid gap-x-8 gap-y-6 border-y border-border py-5 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-5 w-3/4" />
              </div>
            ))}
          </div>
        </Panel>
        <PanelSkeleton rows={3} />
      </div>
    </LoadingRegion>
  );
}

export function PublicFormSkeleton({
  label,
  variant = "compact",
}: {
  label: string;
  variant?: "compact" | "wide";
}): React.JSX.Element {
  return (
    <LoadingRegion label={label}>
      <main
        className={classNames(
          "min-h-svh bg-canvas text-ink lg:grid",
          variant === "wide"
            ? "lg:grid-cols-[minmax(20rem,0.7fr)_minmax(0,1.3fr)]"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.8fr)]",
        )}
      >
        <section aria-hidden="true" className="bg-brand-deep px-6 py-8 sm:px-10 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
          <Skeleton className="h-9 w-24" tone="inverse" />
          <div className="mt-14 max-w-xl lg:my-auto lg:py-16">
            <Skeleton className="h-12 w-full max-w-lg" tone="inverse" />
            <Skeleton className="mt-4 h-12 w-4/5 max-w-md" tone="inverse" />
            <Skeleton className="mt-6 h-5 w-full max-w-lg" tone="inverse" />
            <Skeleton className="mt-3 h-5 w-3/4 max-w-md" tone="inverse" />
          </div>
          <Skeleton className="mt-12 hidden h-4 w-72 lg:block" tone="inverse" />
        </section>
        <section aria-hidden="true" className="flex px-6 py-10 sm:px-10 lg:min-h-svh lg:items-center lg:px-14 xl:px-20">
          <div className={classNames("mx-auto w-full", variant === "wide" ? "max-w-2xl" : "max-w-md")}>
            <Skeleton className="h-9 w-3/5" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <div className="mt-8 space-y-5 rounded-dialog border border-border bg-surface p-5 sm:p-7">
              {Array.from({ length: variant === "wide" ? 4 : 2 }, (_, index) => (
                <div key={index}>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-12 w-full" />
                </div>
              ))}
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </section>
      </main>
    </LoadingRegion>
  );
}
