import Link from "next/link";

import { classNames } from "./class-names";
import { getPageNumberTokens, normalizePageNumbers } from "./page-number-tokens";

/** A page change is a navigation (`href`) or, inside a client widget, an in-place action. */
export type PageNumberPaginationTarget =
  | { href: string; disabled?: boolean }
  | { onSelect: () => void; disabled?: boolean };

type PageNumberPaginationProps = {
  /** Accessible name of the navigation landmark, e.g. "หน้ารายชื่อผู้ป่วย". */
  label: string;
  page: number;
  totalPages: number;
  /** Null on the first page. */
  previous?: PageNumberPaginationTarget | null;
  /** Null on the last page. */
  next?: PageNumberPaginationTarget | null;
  /** Resolved during rendering, without crossing a Server/Client Component boundary. */
  getPageTarget?: (page: number) => PageNumberPaginationTarget | null;
  className?: string;
};

const activeControlClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const inactiveControlClassName =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-text-subtle";

function PaginationControl({
  label,
  target,
  accessibleLabel = label,
  rel,
}: {
  label: string;
  accessibleLabel?: string;
  rel?: "prev" | "next";
  target: PageNumberPaginationTarget | null;
}): React.JSX.Element {
  if (target === null || ("href" in target && target.disabled)) {
    return <span aria-disabled="true" aria-label={accessibleLabel} className={classNames(inactiveControlClassName, "min-w-11")}>{label}</span>;
  }

  if ("href" in target) {
    return (
      <Link aria-label={accessibleLabel} className={classNames(activeControlClassName, "min-w-11")} href={target.href} prefetch={false} rel={rel}>
        {label}
      </Link>
    );
  }

  return (
    <button
      className={classNames(activeControlClassName, "min-w-11 disabled:cursor-not-allowed disabled:opacity-50")}
      aria-label={accessibleLabel}
      disabled={target.disabled}
      onClick={target.onSelect}
      type="button"
    >
      {label}
    </button>
  );
}

/** Shared server navigation and client paging; legacy previous/next-only consumers remain supported. */
export function PageNumberPagination({
  label,
  page,
  totalPages,
  previous,
  next,
  getPageTarget,
  className = "border-t border-border pt-5",
}: PageNumberPaginationProps): React.JSX.Element | null {
  const position = normalizePageNumbers(page, totalPages);
  if (position.totalPages <= 1) {
    return null;
  }

  function numbers(compact: boolean): React.JSX.Element {
    const currentTarget = getPageTarget?.(position.page);
    const CurrentControl = currentTarget && "onSelect" in currentTarget ? "button" : "span";
    return (
      <ul className={classNames("flex flex-wrap items-center justify-center gap-1", compact ? "sm:hidden" : "hidden sm:flex")}>
        {getPageNumberTokens(position.page, position.totalPages, compact).map((token) => (
          <li key={token}>
            {typeof token !== "number" ? <span aria-hidden="true" className="px-1 text-text-muted">…</span> : token === position.page ? (
              <CurrentControl type={CurrentControl === "button" ? "button" : undefined} aria-disabled={CurrentControl === "button" ? true : undefined} aria-current="page" aria-label={`หน้าปัจจุบัน ${token}`} className={classNames(activeControlClassName, "min-w-11 border-action-primary bg-brand-soft text-brand-strong underline underline-offset-4")}>
                {token}
              </CurrentControl>
            ) : (
              <PaginationControl
                accessibleLabel={token === 1 ? "ไปหน้าแรก" : token === position.totalPages ? "ไปหน้าสุดท้าย" : `ไปหน้าที่ ${token}`}
                label={String(token)}
                target={getPageTarget?.(token) ?? null}
              />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <nav
      aria-label={label}
      className={classNames("min-w-0 space-y-3", className)}
    >
      <p aria-live="polite" className="break-words text-sm text-text-muted">
        หน้า {position.page} จาก {position.totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="order-2 sm:order-none"><PaginationControl label="ก่อนหน้า" rel="prev" target={position.page > 1 ? previous ?? getPageTarget?.(position.page - 1) ?? null : null} /></div>
        {getPageTarget ? <div className="w-full min-w-0 sm:w-auto">{numbers(true)}{numbers(false)}</div> : null}
        <div className="order-2 sm:order-none"><PaginationControl label="ถัดไป" rel="next" target={position.page < position.totalPages ? next ?? getPageTarget?.(position.page + 1) ?? null : null} /></div>
      </div>
    </nav>
  );
}
