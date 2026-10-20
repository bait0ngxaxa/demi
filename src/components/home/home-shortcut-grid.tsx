import Link from "next/link";

import { MobileNavigationGlyph } from "@/components/app-shell/mobile-navigation-glyph";
import type { MobileNavigationIcon } from "@/components/app-shell/mobile-tab-projection";

export type HomeShortcut = {
  href: string;
  icon: MobileNavigationIcon;
  label: string;
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
    <section aria-labelledby={headingId} className="mt-7 min-w-0">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={headingId}>
        {heading}
      </h2>
      <nav aria-labelledby={headingId} className="mt-3">
        <ul className="grid min-w-0 grid-cols-4 gap-1 sm:gap-3">
          {shortcuts.map(({ href, icon, label, prefetch }) => (
            <li className="min-w-0" key={href}>
              <Link
                className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-control px-1 py-3 text-center text-xs font-medium leading-5 text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={href}
                prefetch={prefetch ?? false}
              >
                <MobileNavigationGlyph icon={icon} />
                <span className="max-w-full break-words">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
