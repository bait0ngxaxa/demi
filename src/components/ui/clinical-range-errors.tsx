"use client";

import { useCallback, useId, useRef, useState, type FormEvent, type InvalidEvent } from "react";

import {
  CLINICAL_VALUE_LIMITS,
  clinicalValueRangeMessage,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";

export type ClinicalRangeInputProps = {
  min: number;
  max: number;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
  onInvalid: (event: InvalidEvent<HTMLInputElement>) => void;
  onInput: (event: FormEvent<HTMLInputElement>) => void;
};

export type ClinicalRangeErrors = {
  /** Shared clinical limits as `min`/`max`, plus the handlers that show the Thai field-level error. */
  inputProps: (field: string, kind: ClinicalMeasurementKind, describedBy?: string) => ClinicalRangeInputProps;
  /** The field-level error under the input, or null while the value is in range. */
  renderError: (field: string) => React.JSX.Element | null;
};

/**
 * N3: number inputs of clinical measurements take `min`/`max` from the shared clinical limits.
 * When native validation finds a value out of range, the browser bubble is replaced by a Thai
 * field-level error (for example `น้ำหนักต้องอยู่ระหว่าง 1–500 กก.`) and submission stays blocked.
 * Other validity failures keep the browser's own message.
 */
export function useClinicalRangeErrors(): ClinicalRangeErrors {
  const prefix = useId();
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  // One validation pass fires `invalid` on every failing input; only the first takes focus.
  const focusTaken = useRef(false);

  const errorId = useCallback((field: string): string => `${prefix}-${field}-range-error`, [prefix]);

  const inputProps = useCallback(
    (field: string, kind: ClinicalMeasurementKind, describedBy?: string): ClinicalRangeInputProps => {
      const limit = CLINICAL_VALUE_LIMITS[kind];
      const hasError = errors[field] !== undefined;
      const describedByIds = [describedBy, hasError ? errorId(field) : undefined].filter(Boolean).join(" ");

      return {
        min: limit.min,
        max: limit.max,
        "aria-invalid": hasError ? true : undefined,
        "aria-describedby": describedByIds || undefined,
        onInvalid: (event) => {
          const input = event.currentTarget;

          if (!input.validity.rangeUnderflow && !input.validity.rangeOverflow) {
            return;
          }

          event.preventDefault();
          const message = clinicalValueRangeMessage(kind);
          setErrors((current) => (current[field] === message ? current : { ...current, [field]: message }));

          if (!focusTaken.current) {
            focusTaken.current = true;
            input.focus();
            queueMicrotask(() => {
              focusTaken.current = false;
            });
          }
        },
        onInput: () => {
          setErrors((current) => {
            if (current[field] === undefined) {
              return current;
            }

            const next = { ...current };
            delete next[field];
            return next;
          });
        },
      };
    },
    [errorId, errors],
  );

  const renderError = useCallback(
    (field: string): React.JSX.Element | null => {
      const message = errors[field];

      return message === undefined ? null : (
        <span className="block text-sm font-normal text-danger" id={errorId(field)}>
          {message}
        </span>
      );
    },
    [errorId, errors],
  );

  return { inputProps, renderError };
}
