"use client";

import { useState, type ComponentPropsWithoutRef } from "react";

import { classNames } from "./class-names";

export type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  /** Layout classes (e.g. margins) for the wrapper; the input keeps its own field styling. */
  containerClassName?: string;
};

/**
 * A password field with a persistent show/hide toggle. The toggle stays in the chosen state until pressed again;
 * it changes only the input type, never the value, name, or autocomplete hint.
 */
export function PasswordInput({ className, containerClassName, disabled, id, ...props }: PasswordInputProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <div className={classNames("relative w-full", containerClassName)}>
      <input
        {...props}
        className={classNames(className, "w-full pr-12")}
        disabled={disabled}
        id={id}
        type={visible ? "text" : "password"}
      />
      <button
        aria-controls={id}
        aria-label="แสดงรหัสผ่าน"
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-control text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        title={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        type="button"
      >
        <svg aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
          <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? null : <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
