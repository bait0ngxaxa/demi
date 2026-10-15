"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "./button";

/**
 * Submit button for `next/form` search and filter forms: shows pending state from the moment
 * the navigation starts, before the destination's loading UI is available.
 */
export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel,
  ...props
}: Omit<ButtonProps, "loading" | "type"> & { pendingLabel: string }): React.JSX.Element {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={disabled} loading={pending} type="submit">
      {pending ? pendingLabel : children}
    </Button>
  );
}
