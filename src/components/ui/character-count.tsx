/**
 * Live length counter for a free-text field (COPY-DISTILL R2): the limit is shown as "used/max"
 * instead of a prose rule. Counts UTF-16 code units of the value the server validates: trimmed,
 * and with inner whitespace runs collapsed to one space when `collapseWhitespace` is set.
 */
export function CharacterCount({ id, value, max, collapseWhitespace = false }: {
  id?: string;
  value: string;
  max: number;
  collapseWhitespace?: boolean;
}): React.JSX.Element {
  const normalized = collapseWhitespace ? value.trim().replace(/\s+/gu, " ") : value.trim();
  const count = normalized.length;
  return (
    <p id={id} className={`text-sm tabular-nums ${count > max ? "font-medium text-danger" : "text-text-muted"}`}>
      {count.toLocaleString("th-TH")}/{max.toLocaleString("th-TH")}
    </p>
  );
}
