import type { ComponentPropsWithRef } from "react";

import { classNames } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "default" | "compact";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "type-action bg-action-primary text-white hover:bg-action-primary-hover disabled:bg-action-primary-muted",
  secondary:
    "font-medium border border-border-strong bg-surface text-text hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong disabled:text-text-subtle",
  ghost: "font-medium text-brand-strong hover:bg-brand-soft disabled:text-text-subtle",
  danger: "type-action bg-danger text-white hover:bg-danger/90 disabled:opacity-55",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-12 px-5 py-2.5 text-sm",
  compact: "min-h-11 px-3.5 py-2 text-sm",
};

export function buttonClassName({
  variant = "primary",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return classNames(
    "inline-flex items-center justify-center rounded-control transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  children,
  disabled,
  loading = false,
  size = "default",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      aria-busy={loading || undefined}
      className={buttonClassName({ className, size, variant })}
      disabled={loading || disabled}
      type={type}
      {...props}
    >
      {loading ? <LoadingSpinner className="mr-2" /> : null}
      {children}
    </button>
  );
}

export function LoadingSpinner({ className }: { className?: string } = {}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
