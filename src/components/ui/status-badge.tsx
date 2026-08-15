import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export type StatusVariant = "neutral" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<StatusVariant, string> = {
  neutral: "bg-surface-muted text-text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export type StatusBadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: StatusVariant;
};

export function StatusBadge({
  className,
  variant = "neutral",
  ...props
}: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={classNames(
        "inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
