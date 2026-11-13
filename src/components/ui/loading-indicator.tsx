type LoadingIndicatorProps = { size?: "sm" | "md" };

/** CSS-only progress mark; the surrounding status text supplies its accessible name. */
export function LoadingIndicator({ size = "md" }: LoadingIndicatorProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border-2 border-line border-t-brand motion-safe:animate-spin ${size === "sm" ? "size-4" : "size-8"}`}
    />
  );
}
