"use client";

import { Alert } from "./alert";
import { Button } from "./button";
import { unknownOutcomeMessage } from "./mutation-action-state";

/** Reloading the page is the reconciliation step: it re-reads persisted state and discards stale submission identities. */
export function UnknownOutcomeAlert({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}): React.JSX.Element | null {
  if (!active) {
    return null;
  }

  return (
    <Alert className={className} role="alert" variant="warning">
      <p>{unknownOutcomeMessage}</p>
      <Button className="mt-3" onClick={() => window.location.reload()} size="compact" type="button" variant="secondary">
        โหลดข้อมูลล่าสุด
      </Button>
    </Alert>
  );
}
