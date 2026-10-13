import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

type PageHeaderBreadcrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description: string;
  breadcrumbs?: readonly PageHeaderBreadcrumb[];
  actions?: ReactNode;
  onBreadcrumbClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  onBreadcrumbClick,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className="border-b border-border pb-8">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="ลำดับหน้า" className="mb-4">
          <ol className="flex flex-wrap items-center gap-2 text-sm leading-6 text-text-muted">
            {breadcrumbs.map((breadcrumb, index) => (
              <li className="flex min-w-0 max-w-full items-start gap-2" key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span aria-hidden="true" className="inline-flex min-h-11 shrink-0 items-center">/</span> : null}
                {breadcrumb.href ? (
                  <Link
                    className="inline-flex min-h-11 min-w-0 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={breadcrumb.href}
                    onClick={onBreadcrumbClick}
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="inline-flex min-h-11 min-w-0 items-center">{breadcrumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 basis-80 flex-1">
          <h1 className="text-balance text-3xl font-bold tracking-[-0.03em] text-text sm:text-4xl">
            {title}
          </h1>
          <p className="type-readable mt-4 text-base leading-7 text-text-muted">{description}</p>
        </div>
        {actions ? <div className="max-w-full shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
