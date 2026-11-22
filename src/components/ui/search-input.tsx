"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type InputEvent, type KeyboardEvent, type Ref } from "react";

import { classNames } from "./class-names";
import { CloseGlyph } from "./glyphs";
import { inputClassName } from "./input";

export type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  /** Layout classes (e.g. margins, flex sizing) for the wrapper; the input keeps the shared field styling. */
  containerClassName?: string;
  /** Runs after the value has been cleared, e.g. to reset a combobox's active option. */
  onClear?: () => void;
  /**
   * Whether clearing submits the field's form. `"auto"` submits only an uncontrolled field that rendered with a
   * value (a GET form whose results are already filtered by it), so clearing shows every result again.
   */
  submitOnClear?: "auto" | boolean;
  /** Escape clears a non-empty field, like the native search field. Turn off where Escape closes a list. */
  clearOnEscape?: boolean;
  clearLabel?: string;
};

function hasText(value: ComponentProps<"input">["value"]): boolean {
  if (value === undefined || value === null) return false;
  return String(value) !== "";
}

function assignRef(ref: Ref<HTMLInputElement> | undefined, node: HTMLInputElement | null): void {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

/**
 * The only search field in the app (DESIGN.md SEARCH-INPUT). The browser's own cancel button is hidden in
 * globals.css because a pseudo-element's tap area cannot exceed what it draws; this renders a real 48×48 button
 * with a 20px icon over the field's end edge instead, so the field never changes height while typing or clearing.
 */
export function SearchInput({
  className,
  containerClassName,
  onClear,
  submitOnClear = "auto",
  clearOnEscape = true,
  clearLabel = "ล้างคำค้นหา",
  disabled,
  readOnly,
  defaultValue,
  value,
  onInput,
  onKeyDown,
  ref,
  id,
  ...props
}: SearchInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controlled = value !== undefined;
  const startedWithValue = useRef(hasText(defaultValue));
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(() => hasText(defaultValue));
  const showClear = (controlled ? hasText(value) : uncontrolledHasValue) && !disabled && !readOnly;

  // A restored form value (back navigation, autofill) arrives without an input event.
  useEffect(() => {
    if (!controlled && inputRef.current) setUncontrolledHasValue(inputRef.current.value !== "");
  }, [controlled]);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  function clear(): void {
    const input = inputRef.current;
    if (!input) return;
    // The prototype setter bypasses React's value tracker, so the dispatched input event reaches onChange.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setUncontrolledHasValue(false);
    onClear?.();
    input.focus();
    const submit = submitOnClear === "auto" ? !controlled && startedWithValue.current : submitOnClear;
    if (submit) input.form?.requestSubmit();
  }

  function handleInput(event: InputEvent<HTMLInputElement>): void {
    onInput?.(event);
    if (!controlled) setUncontrolledHasValue(event.currentTarget.value !== "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Escape" || !clearOnEscape || !showClear) return;
    event.preventDefault();
    clear();
  }

  return (
    // A span keeps the markup valid inside the <label> most callers wrap the field in.
    <span className={classNames("relative block w-full min-w-0", containerClassName)}>
      <input
        {...props}
        className={classNames(inputClassName, "pe-12", className)}
        defaultValue={defaultValue}
        disabled={disabled}
        id={id}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        ref={setRefs}
        type="search"
        value={value}
      />
      {showClear ? (
        <button
          aria-controls={id}
          aria-label={clearLabel}
          className="group absolute inset-y-0 end-0 inline-flex w-12 items-center justify-center text-text-muted focus-visible:outline-none"
          onClick={clear}
          // Keep focus in the field so a combobox list does not close between press and clear.
          onMouseDown={(event) => event.preventDefault()}
          title={clearLabel}
          type="button"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full transition-colors group-hover:bg-surface-muted group-hover:text-text group-focus-visible:bg-surface-muted group-focus-visible:text-text group-focus-visible:ring-4 group-focus-visible:ring-focus-ring">
            <CloseGlyph className="size-5" />
          </span>
        </button>
      ) : null}
    </span>
  );
}
