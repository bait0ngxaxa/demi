"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Submission identity, not user data: a refreshed version or nonce never makes a form dirty. */
const ALWAYS_IGNORED: readonly string[] = ["expectedVersion", "submissionNonce"];

/**
 * The form's current values as one comparable string: `[name, value]` pairs sorted by name
 * (stable, so repeated names keep their order), without ignored names, Next.js `$ACTION_*`
 * internals and File entries. Disabled controls are absent, as in a real submission.
 */
export function formValuesSnapshot(form: HTMLFormElement, ignore: readonly string[] = []): string {
  const skipped = new Set([...ALWAYS_IGNORED, ...ignore]);
  const pairs: [string, string][] = [];
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== "string" || skipped.has(name) || name.startsWith("$ACTION")) {
      continue;
    }
    pairs.push([name, value]);
  }
  pairs.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return JSON.stringify(pairs);
}

/**
 * Whether an edit form that stays on the page after saving holds unsaved changes, so its submit
 * can be gated on them (DESIGN.md, SAVE-STATE). The baseline is the form's values after mount,
 * taken again whenever `savedKey` changes to a new defined value: pass the confirmed SUCCESS state
 * (`state.status === "SUCCESS" ? state : undefined`) so the values just saved become the baseline,
 * while an ERROR keeps the user's edits dirty. Typing a field back to its saved value is clean.
 */
export function useFormDirty(
  formRef: RefObject<HTMLFormElement | null>,
  options: { savedKey: unknown; ignore?: readonly string[] },
): { dirty: boolean } {
  const { savedKey } = options;
  const ignoreKey = JSON.stringify(options.ignore ?? []);
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form || (savedKey === undefined && baseline.current !== null)) {
      return;
    }
    baseline.current = formValuesSnapshot(form, JSON.parse(ignoreKey) as string[]);
    setDirty(false);
  }, [formRef, ignoreKey, savedKey]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const ignore = JSON.parse(ignoreKey) as string[];
    const recompute = (): void => {
      setDirty(baseline.current !== null && formValuesSnapshot(form, ignore) !== baseline.current);
    };
    // The `reset` event fires before the fields are restored, so compare once the reset has run.
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    const afterReset = (): void => {
      clearTimeout(resetTimer);
      resetTimer = setTimeout(recompute, 0);
    };
    form.addEventListener("input", recompute);
    form.addEventListener("change", recompute);
    form.addEventListener("reset", afterReset);
    return () => {
      clearTimeout(resetTimer);
      form.removeEventListener("input", recompute);
      form.removeEventListener("change", recompute);
      form.removeEventListener("reset", afterReset);
    };
  }, [formRef, ignoreKey]);

  return { dirty };
}
