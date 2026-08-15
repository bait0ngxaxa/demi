import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

type AlertVariant = "neutral" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<AlertVariant, string> = {
  neutral: "border-border bg-surface-muted text-text",
  success: "border-success/20 bg-success-soft text-text",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
  info: "border-info/20 bg-info-soft text-info",
};

export type AlertProps = ComponentPropsWithoutRef<"div"> & {
  variant?: AlertVariant;
};

export function Alert({
  className,
  role,
  variant = "neutral",
  ...props
}: AlertProps): React.JSX.Element {
  return (
    <div
      className={classNames(
        "rounded-panel border px-4 py-4 text-sm leading-6",
        variantClasses[variant],
        className,
      )}
      role={role ?? (variant === "danger" ? "alert" : "status")}
      {...props}
    />
  );
}
