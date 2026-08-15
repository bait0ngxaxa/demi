import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export const inputClassName =
  "min-h-12 w-full rounded-control border border-border bg-surface px-4 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-subtle aria-invalid:border-danger aria-invalid:ring-danger";

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">): React.JSX.Element {
  return <input className={classNames(inputClassName, className)} {...props} />;
}
