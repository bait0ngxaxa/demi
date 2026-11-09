import type { ReactNode } from "react";

import { classNames } from "@/components/ui/class-names";

/**
 * Read-only surface for one record the server has already returned as persisted.
 * Drafts, pending submissions and unconfirmed outcomes must never use it: they stay in entry surfaces.
 */
export function SavedRecordCard({ as: Tag = "div", tone = "current", selected = false, children, ...rest }: {
  /** `history` is a flat, muted record that can no longer change (for example a stopped medication). */
  tone?: "current" | "history";
  /** Marks the record whose detail is open; pair it with `aria-current` on the record's link. */
  selected?: boolean;
  children: ReactNode;
} & ({ as?: "div" | "li"; "aria-labelledby"?: never } | { as: "section"; "aria-labelledby": string })): React.JSX.Element {
  return <Tag className={classNames(
    "min-w-0 rounded-panel border p-4 sm:p-5",
    tone === "history" ? "bg-surface-muted" : "bg-surface shadow-surface",
    selected ? "border-brand" : "border-border",
  )} {...rest}>{children}</Tag>;
}

/** Footer row for the actions on one saved record, so every record places them the same way. */
export function SavedRecordActions({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>;
}

/** Bounded empty state for a saved-record collection; it never offers an action the page does not already have. */
export function SavedRecordEmpty({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="rounded-panel border border-dashed border-border-strong px-4 py-5 text-text-muted sm:px-5">{children}</div>;
}
