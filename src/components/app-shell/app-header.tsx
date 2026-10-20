import { MobileWorkspaceLabel } from "./mobile-workspace-label";

/** Mobile and tablet header; at lg+ the sidebar brand row and identity row carry this context (UI-4.1). */
export function AppHeader(): React.JSX.Element {
  return (
    <header className="app-shell-header app-shell-horizontal-gutter sticky top-0 z-30 flex min-h-app-header items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:hidden">
      <div className="min-w-0">
        <p className="text-lg font-bold tracking-[-0.03em] text-text">DEMI</p>
        <MobileWorkspaceLabel />
      </div>
    </header>
  );
}
