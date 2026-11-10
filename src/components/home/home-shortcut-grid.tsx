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
        {/* Mobile: four icon tiles per row. lg+: bordered cards that fill the workspace (UI-4.1). */}
        <ul className="grid min-w-0 grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {shortcuts.map(({ description, href, icon, label, prefetch }) => (
            <li className="min-w-0" key={href}>
              <Link
                className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-control border border-border bg-surface px-1 py-3 text-center text-xs font-medium leading-5 text-text shadow-surface transition-[background-color,border-color,box-shadow,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:translate-y-px active:bg-surface-muted active:shadow-none lg:h-full lg:min-h-16 lg:flex-row lg:justify-start lg:gap-3 lg:border lg:border-border lg:bg-surface lg:px-4 lg:py-3 lg:text-left lg:text-sm lg:shadow-none lg:transition-colors lg:hover:border-action-primary lg:hover:bg-brand-soft lg:focus-visible:border-action-primary lg:focus-visible:ring-offset-0 lg:active:translate-y-0 lg:active:bg-brand-soft motion-reduce:transition-none motion-reduce:active:translate-y-0"
                href={href}
                prefetch={prefetch ?? false}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong lg:bg-surface-muted">
                  <MobileNavigationGlyph icon={icon} />
                </span>
                <span className="flex min-w-0 max-w-full flex-col lg:flex-1">
                  <span className="break-words lg:font-semibold">{label}</span>
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
