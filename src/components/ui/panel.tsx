import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export function Panel({ className, ...props }: ComponentPropsWithoutRef<"section">): React.JSX.Element {
  return (
    <section
      className={classNames("rounded-panel border border-border bg-surface p-5 sm:p-7", className)}
      {...props}
    />
  );
}
