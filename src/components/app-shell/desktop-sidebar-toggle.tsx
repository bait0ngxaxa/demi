import { classNames } from "@/components/ui/class-names";

import { getDesktopSidebarToggleLabel } from "./desktop-sidebar-state";

type DesktopSidebarToggleProps = {
  expanded: boolean;
  onToggle: () => void;
};

export function DesktopSidebarToggle({
  expanded,
  onToggle,
}: DesktopSidebarToggleProps): React.JSX.Element {
  const label = getDesktopSidebarToggleLabel(expanded ? "expanded" : "collapsed");

  return (
    <button
      aria-controls="desktop-application-navigation"
      aria-expanded={expanded}
      aria-label={label}
      className={classNames(
        "inline-flex shrink-0 items-center justify-center rounded-control text-sm font-semibold text-white/82 transition-colors hover:bg-navigation-hover hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-bright",
        expanded ? "min-h-11 gap-2 px-3 py-2" : "min-h-12 w-14 flex-col gap-0.5 px-1 py-1 text-xs",
      )}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        <path d="M5 4v16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path
          d={expanded ? "m15 7-5 5 5 5" : "m10 7 5 5-5 5"}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
      <span>{expanded ? label : "ขยาย"}</span>
    </button>
  );
}
