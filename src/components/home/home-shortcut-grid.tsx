import Link from "next/link";

import { MobileNavigationGlyph } from "@/components/app-shell/mobile-navigation-glyph";
import type { MobileNavigationIcon } from "@/components/app-shell/mobile-tab-projection";

export type HomeShortcut = {
  href: string;
  icon: MobileNavigationIcon;
  label: string;
  /** One line shown on desktop cards only; mobile tiles stay icon + label. */
  description?: string;
  prefetch?: boolean;
};

export function HomeShortcutGrid({
  heading = "เมนูด่วน",
  headingId = "personal-shortcuts-heading",
  shortcuts,
}: {
  heading?: string;
  headingId?: string;
  shortcuts: readonly HomeShortcut[];
}): React.JSX.Element {
  return (
    <section aria-labelledby={headingId} className="mt-7 min-w-0 lg:mt-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={headingId}>
        {heading}
      </h2>
      <nav aria-labelledby={headingId} className="mt-3">
        {/*
          Mobile: four card-less icon buttons per row; each label reserves two lines so icons align and rows
          never stretch. lg+: bordered cards that fill the workspace (UI-4.1).
        */}
        <ul className="grid min-w-0 grid-cols-4 gap-x-2 gap-y-3 text-sm sm:gap-x-3 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:gap-3">
          {shortcuts.map(({ description, href, icon, label, prefetch }) => (
            <li className="min-w-0" key={href}>
              <Link
                className="group flex min-w-0 flex-col items-center justify-start gap-2 rounded-2xl px-0.5 pt-1 pb-2 text-center text-sm font-medium leading-snug text-text no-underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:min-h-16 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:border lg:border-border lg:bg-surface lg:px-4 lg:py-3 lg:text-left lg:text-sm lg:leading-5 lg:transition-colors lg:hover:border-action-primary lg:hover:bg-brand-soft lg:focus-visible:border-action-primary lg:focus-visible:ring-offset-0 lg:active:bg-brand-soft motion-reduce:transition-none"
                href={href}
                prefetch={prefetch ?? false}
              >
                <span className="flex size-15 shrink-0 items-center justify-center rounded-[18px] bg-brand-soft text-brand-strong shadow-[inset_0_-2px_0_rgb(11_81_70/0.12)] transition-[background-color,transform,box-shadow] group-hover:bg-brand-pale group-active:translate-y-px group-active:bg-brand-pale group-active:shadow-none motion-reduce:transition-none motion-reduce:group-active:translate-y-0 [&>svg]:size-7 lg:size-10 lg:rounded-control lg:bg-surface-muted lg:shadow-none lg:transition-none lg:group-hover:bg-surface-muted lg:group-active:translate-y-0 lg:group-active:bg-surface-muted lg:[&>svg]:size-5">
                  <MobileNavigationGlyph icon={icon} />
                </span>
                <span className="flex min-w-0 max-w-full flex-col lg:flex-1">
                  <span className="min-h-[2lh] line-clamp-2 [overflow-wrap:anywhere] lg:min-h-0 lg:line-clamp-none lg:text-left lg:font-semibold lg:[overflow-wrap:break-word]">
                    {label}
                  </span>
                  {description ? (
                    <span className="hidden truncate text-xs font-normal leading-5 text-text-muted lg:block">{description}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
