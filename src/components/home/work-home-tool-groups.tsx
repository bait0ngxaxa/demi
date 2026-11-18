import Link from "next/link";

import type { WorkHomeProjection } from "./work-home-projection";

export function WorkHomeToolGroups({
  groups,
}: {
  groups: WorkHomeProjection["toolGroups"];
}): React.JSX.Element {
  return (
    <section aria-labelledby="work-home-tools-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="work-home-tools-heading">
        เครื่องมือที่ใช้บ่อย
      </h2>
      <div className="mt-4 grid gap-x-8 gap-y-6 @2xl/home-main:grid-cols-2">
        {groups.map(({ id, label, tools }) => (
          <div className="min-w-0" key={id}>
            <h3 className="text-sm font-semibold text-text-muted">{label}</h3>
            <ul className="mt-2">
              {tools.map(({ href, label: toolLabel, description, prefetch }) => (
                <li className="border-t border-surface-muted" key={href}>
                  <Link
                    className="group block min-h-11 py-2.5 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={href}
                    prefetch={prefetch ?? false}
                  >
                    <span className="block text-sm font-semibold text-brand-strong group-hover:underline">{toolLabel}</span>
                    {description ? <span className="block text-sm leading-6 text-text-muted">{description}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
