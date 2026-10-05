"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function PatientContentLink({ href, children, className, current }: {
  href: string;
  children: ReactNode;
  className: string;
  current?: boolean;
}): React.JSX.Element {
  return <Link href={href} prefetch={false} aria-current={current ? "page" : undefined}
    className={className}
    onNavigate={(event) => {
      // A document GET also avoids trusting a previously cached private RSC navigation result.
      event.preventDefault();
      window.location.assign(href);
    }}>{children}</Link>;
}
