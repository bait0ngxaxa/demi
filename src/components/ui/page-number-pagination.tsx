import Link from "next/link";

import { classNames } from "./class-names";

/** A page change is a navigation (`href`) or, inside a client widget, an in-place action. */
export type PageNumberPaginationTarget =
  | { href: string }
  | { onSelect: () => void; disabled?: boolean };

type PageNumberPaginationProps = {
  /** Accessible name of the navigation landmark, e.g. "หน้ารายชื่อผู้ป่วย". */
  label: string;
  page: number;
  totalPages: number;
  /** Null on the first page. */
  previous: PageNumberPaginationTarget | null;
  /** Null on the last page. */
  next: PageNumberPaginationTarget | null;
  className?: string;
};

const activeControlClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const inactiveControlClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-text-subtle";

function PaginationControl({
  label,
  target,
}: {
  label: string;
  target: PageNumberPaginationTarget | null;
}): React.JSX.Element {
  if (target === null) {
    return <span className={inactiveControlClassName}>{label}</span>;
  }

  if ("href" in target) {
    return (
      <Link className={activeControlClassName} href={target.href}>
        {label}
      </Link>
    );
  }

  return (
    <button
      className={classNames(activeControlClassName, "disabled:cursor-not-allowed disabled:opacity-50")}
      disabled={target.disabled}
      onClick={target.onSelect}
      type="button"
    >
      {label}
    </button>
  );
}

/** "หน้า X จาก Y" with previous/next controls; renders nothing for a single page. */
export function PageNumberPagination({
  label,
  page,
  totalPages,
  previous,
  next,
  className = "border-t border-border pt-5",
}: PageNumberPaginationProps): React.JSX.Element | null {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={label}
      className={classNames("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <p className="text-sm text-text-muted">
        หน้า {page} จาก {totalPages}
      </p>
      <div className="flex gap-3">
        <PaginationControl label="ก่อนหน้า" target={previous} />
        <PaginationControl label="ถัดไป" target={next} />
      </div>
    </nav>
  );
}
