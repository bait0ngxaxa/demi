import Link from "next/link";
import type { ReactNode } from "react";

type PageHeaderBreadcrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description: string;
  breadcrumbs?: readonly PageHeaderBreadcrumb[];
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className="border-b border-border pb-7">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="ลำดับหน้า" className="mb-4">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            {breadcrumbs.map((breadcrumb, index) => (
              <li className="flex items-center gap-2" key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {breadcrumb.href ? (
                  <Link
                    className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={breadcrumb.href}
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{breadcrumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em] text-text sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-text-muted">{description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
