import { classNames } from "./class-names";

type LocalNavigationItem<TValue extends string> = {
  label: string;
  value: TValue;
};

type LocalNavigationProps<TValue extends string> = {
  ariaLabel: string;
  items: readonly LocalNavigationItem<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
};

export function LocalNavigation<TValue extends string>({
  ariaLabel,
  items,
  value,
  onChange,
}: LocalNavigationProps<TValue>): React.JSX.Element {
  return (
    <div aria-label={ariaLabel} className="flex w-fit gap-1 rounded-panel bg-surface-muted p-1" role="group">
      {items.map((item) => {
        const selected = value === item.value;

        return (
          <button
            aria-pressed={selected}
            className={classNames(
              "min-h-11 rounded-control px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring",
              selected
                ? "bg-surface text-brand-strong shadow-surface"
                : "text-text-muted hover:bg-surface/70 hover:text-text",
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
