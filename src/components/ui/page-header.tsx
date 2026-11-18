import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import { classNames } from "./class-names";
import { ChevronGlyph } from "./glyphs";

type PageHeaderBreadcrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: readonly PageHeaderBreadcrumb[];
  actions?: ReactNode;
  context?: ReactNode;
  onBreadcrumbClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  context,
  onBreadcrumbClick,
}: PageHeaderProps): React.JSX.Element {
  const backLink = breadcrumbs?.findLast(({ href }) => Boolean(href));
  const breadcrumbFocus = "focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header-surface";

  return (
    <header className={classNames(
      "rounded-[16px] border border-header-border bg-header-surface px-5 pb-5 sm:px-6 lg:px-7 lg:pb-6 lg:pt-5",
      backLink ? "pt-3" : "pt-5",
    )}>
      {breadcrumbs?.length ? (
        <nav aria-label="ลำดับหน้า" className={backLink ? "mb-2 lg:mb-4" : "mb-4 hidden lg:block"}>
          {backLink?.href ? (
            <Link
              className={classNames(
                "-ml-1.5 inline-flex min-h-11 max-w-full items-center gap-1 text-sm font-semibold text-brand-strong no-underline lg:hidden",
                breadcrumbFocus,
              )}
              href={backLink.href}
              onClick={onBreadcrumbClick}
            >
              <ChevronGlyph direction="left" className="size-5 shrink-0" />
              <span className="min-w-0 break-words">{backLink.label}</span>
            </Link>
          ) : null}
          <ol className="hidden flex-wrap items-center gap-2 text-sm leading-6 text-header-muted lg:flex">
            {breadcrumbs.map((breadcrumb, index) => (
              <li className="flex min-w-0 max-w-full items-start gap-2" key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span aria-hidden="true" className="inline-flex min-h-11 shrink-0 items-center">/</span> : null}
                {breadcrumb.href ? (
                  <Link
                    className={classNames("inline-flex min-h-11 min-w-0 items-center break-words font-semibold text-brand-strong underline decoration-brand-pale underline-offset-4 hover:text-brand", breadcrumbFocus)}
                    href={breadcrumb.href}
                    onClick={onBreadcrumbClick}
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} className="inline-flex min-h-11 min-w-0 items-center break-words">{breadcrumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 basis-80 flex-1">
          <h1 className="text-balance break-words text-2xl font-bold tracking-[-0.03em] text-brand-deep sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="type-readable mt-1.5 break-words text-[15px] leading-6 text-header-muted sm:text-base sm:leading-7">{description}</p> : null}
          {context != null ? <div className="mt-3 min-w-0">{context}</div> : null}
        </div>
        {actions ? <div className="max-w-full shrink-0 sm:ml-auto">{actions}</div> : null}
      </div>
    </header>
  );
}
