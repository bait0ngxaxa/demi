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
        <ul className="grid min-w-0 grid-cols-4 gap-1 sm:gap-3 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {shortcuts.map(({ description, href, icon, label, prefetch }) => (
            <li className="min-w-0" key={href}>
              <Link
                className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-control px-1 py-3 text-center text-xs font-medium leading-5 text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring lg:h-full lg:min-h-16 lg:flex-row lg:justify-start lg:gap-3 lg:border lg:border-border lg:bg-surface lg:px-4 lg:py-3 lg:text-left lg:text-sm lg:transition-colors lg:hover:border-action-primary lg:hover:bg-brand-soft lg:focus-visible:border-action-primary motion-reduce:transition-none"
                href={href}
                prefetch={prefetch ?? false}
              >
                <span className="flex shrink-0 items-center justify-center lg:size-10 lg:rounded-control lg:bg-surface-muted lg:text-brand-strong">
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
