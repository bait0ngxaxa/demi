const chevronPaths = {
  left: "m15 5-7 7 7 7",
  right: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
} as const;

export function ChevronGlyph({
  direction,
  className = "size-5",
}: {
  direction: keyof typeof chevronPaths;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d={chevronPaths[direction]} />
    </svg>
  );
}
