import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export type SkeletonProps = ComponentPropsWithoutRef<"div"> & {
  tone?: "default" | "inverse";
};

export function Skeleton({
  className,
  tone = "default",
  ...props
}: SkeletonProps): React.JSX.Element {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={classNames("demi-skeleton rounded-control", className)}
      data-tone={tone}
    />
  );
}
